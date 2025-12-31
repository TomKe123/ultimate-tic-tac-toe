#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function findNode() {
  const candidates = [];
  if (process.env.FORCE_NODE) candidates.push(process.env.FORCE_NODE);
  if (process.env.NODE_EXE) candidates.push(process.env.NODE_EXE);
  candidates.push(process.execPath);
  if (process.platform === 'win32') {
    candidates.push('C:\\Program Files\\nodejs\\node.exe', 'C:\\Program Files (x86)\\nodejs\\node.exe');
  } else {
    candidates.push('/usr/local/bin/node', '/usr/bin/node');
  }
  for (const c of candidates) {
    try {
      if (!c) continue;
      if (fs.existsSync(c)) return c;
    } catch (e) {}
  }
  return process.execPath;
}

function spawnWithPrefix(name, cmd, args, opts = {}) {
  const p = spawn(cmd, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  p.stdout.on('data', d => process.stdout.write(`[${name}] ${d.toString()}`));
  p.stderr.on('data', d => {
    const s = d.toString();
    process.stderr.write(`[${name} ERR] ${s}`);
    if (/nodist/i.test(s)) {
      console.error('[start.js] Detected nodist error. Consider setting a Node version with nodist or install a system Node and set NODE_EXE or FORCE_NODE to its path.');
    }
  });
  p.on('exit', code => console.log(`[${name}] exited with ${code}`));
  return p;
}

console.log('Starting server and dev server...');

const nodePath = findNode();
let viteCli = null;
try { viteCli = require.resolve('vite/bin/vite.js'); } catch (e) {
  try { viteCli = require.resolve('vite/cli.js'); } catch (e2) { viteCli = null }
}

// Start backend (direct node) for more control
const serverProc = spawnWithPrefix('server', nodePath, [path.resolve(__dirname, '..', 'server', 'index.cjs')]);

let devStarted = false;
const startDev = () => {
  if (devStarted) return;
  devStarted = true;
  if (viteCli && fs.existsSync(viteCli)) {
    spawnWithPrefix('dev', nodePath, [viteCli, '--config', './vite.config.mjs']);
  } else {
    // fallback to npm run dev if vite CLI not resolvable
    spawnWithPrefix('dev', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev']);
  }
};

serverProc.stdout && serverProc.stdout.on('data', (buf) => {
  const s = buf.toString();
  if (s.toLowerCase().includes('listening') || s.toLowerCase().includes('listening on') || s.toLowerCase().includes('ws server listening')) {
    console.log('[start.js] server appears to be listening -> starting dev server');
    startDev();
  }
});

// fallback: start dev after 1s if server doesn't emit listening fast
setTimeout(() => startDev(), 1000);

function shutdown() {
  console.log('\nShutting down...');
  try { serverProc.kill(); } catch (e) {}
  process.exit();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', () => { try { serverProc.kill(); } catch (e) {} });
