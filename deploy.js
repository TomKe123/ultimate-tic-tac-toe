#!/usr/bin/env node
/**
 * 跨平台一键部署脚本 (Node.js)
 * 使用方法: node deploy.js [WS_URL]
 * 示例: node deploy.js wss://your-domain.com/ws
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const WS_URL = process.argv[2] || 'ws://localhost:3000';
const isWindows = process.platform === 'win32';

console.log('==========================================');
console.log('复合井字棋 - 生产环境部署脚本 (跨平台)');
console.log('==========================================');
console.log(`\nWebSocket URL: ${WS_URL}\n`);

// 辅助函数
function run(cmd, options = {}) {
  try {
    console.log(`\n$ ${cmd}`);
    return execSync(cmd, { stdio: 'inherit', ...options });
  } catch (error) {
    console.error(`❌ 命令执行失败: ${cmd}`);
    process.exit(1);
  }
}

function checkNodeVersion() {
  const version = process.version.replace('v', '').split('.')[0];
  if (parseInt(version) < 20) {
    console.error(`❌ 错误: Node.js 版本需要 >= 20，当前版本: ${process.version}`);
    process.exit(1);
  }
  console.log(`✅ Node.js 版本检查通过: ${process.version}`);
}

function checkPm2() {
  try {
    execSync('pm2 -v', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function generateNginxConfig() {
  const config = `# Nginx 配置示例
server {
    listen 80;
    server_name your-domain.com;

    # 静态文件根目录
    root ${path.resolve(__dirname, 'dist').replace(/\\/g, '/')};
    index index.html;

    # 前端路由
    location / {
        try_files $uri $uri/ /index.html;
    }

    # WebSocket 反向代理
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # SSL 配置 (如果使用 HTTPS)
    # listen 443 ssl http2;
    # ssl_certificate /path/to/cert.pem;
    # ssl_certificate_key /path/to/key.pem;
}`;

  fs.writeFileSync('nginx.conf.example', config, 'utf8');
  console.log('✅ 已生成: nginx.conf.example');
}

function generateIISConfig() {
  const config = `<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="WebSocket" stopProcessing="true">
          <match url="^ws$" />
          <action type="Rewrite" url="http://localhost:3000" />
        </rule>
        <rule name="SPA" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/" />
        </rule>
      </rules>
    </rewrite>
    <webSocket enabled="true" />
  </system.webServer>
</configuration>`;

  fs.writeFileSync('web.config.example', config, 'utf8');
  console.log('✅ 已生成: web.config.example');
}

// 主流程
async function deploy() {
  try {
    // 1. 检查环境
    checkNodeVersion();

    // 2. 安装依赖
    console.log('\n📦 安装依赖...');
    run('npm ci --production=false');

    // 3. 构建前端
    console.log(`\n🔨 构建前端 (VITE_WS_URL=${WS_URL})...`);
    const buildCmd = isWindows
      ? `set VITE_WS_URL=${WS_URL} && npm run build`
      : `VITE_WS_URL=${WS_URL} npm run build`;
    run(buildCmd, { shell: true });

    // 4. 检查构建产物
    if (!fs.existsSync('dist')) {
      console.error('❌ 错误: 构建失败，dist 目录不存在');
      process.exit(1);
    }
    console.log('✅ 前端构建完成: dist/');

    // 5. 检查并安装 pm2
    console.log('\n🔍 检查 pm2...');
    if (!checkPm2()) {
      console.log('⚠️  未检测到 pm2，正在安装...');
      run('npm install -g pm2');
    }

    // 6. 停止旧进程
    console.log('\n🔄 检查并停止旧进程...');
    try {
      execSync('pm2 delete uttt-ws', { stdio: 'ignore' });
    } catch {
      console.log('没有运行中的进程');
    }

    // 7. 启动后端
    console.log('\n🚀 启动 WebSocket 服务器...');
    run('pm2 start server/index.cjs --name uttt-ws');
    run('pm2 save');

    // 8. 生成配置文件
    console.log('\n📝 生成配置文件...');
    generateNginxConfig();
    if (isWindows) {
      generateIISConfig();
    }

    // 9. 输出部署信息
    console.log('\n==========================================');
    console.log('✅ 部署完成！');
    console.log('==========================================');
    console.log('\n📋 部署信息：');
    console.log(`  - 前端静态文件: ${path.resolve(__dirname, 'dist')}`);
    console.log('  - WebSocket 服务: http://0.0.0.0:3000');
    console.log(`  - WebSocket URL: ${WS_URL}`);
    console.log('  - pm2 进程名: uttt-ws');
    console.log('\n🔧 后续操作：');
    console.log(`  1. 将 ${isWindows ? 'IIS/Nginx' : 'Nginx'} 站点根目录指向: ${path.resolve(__dirname, 'dist')}`);
    console.log(`  2. 参考 ${isWindows ? 'web.config.example 或 ' : ''}nginx.conf.example 配置 WebSocket 反代`);
    console.log('  3. 配置 SSL 证书 (生产环境必须)');
    console.log(`  4. 重启 ${isWindows ? 'IIS/Nginx' : 'Nginx'}`);
    console.log('\n📊 查看服务状态:');
    console.log('  - pm2 status');
    console.log('  - pm2 logs uttt-ws');
    console.log('  - pm2 monit');
    console.log('\n🛑 停止服务:');
    console.log('  - pm2 stop uttt-ws');
    console.log('  - pm2 delete uttt-ws\n');

  } catch (error) {
    console.error('\n❌ 部署失败:', error.message);
    process.exit(1);
  }
}

// 运行
deploy();
