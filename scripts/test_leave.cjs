const WebSocket = require('ws')
const URL = process.env.WS_URL || 'ws://localhost:3000'

function makeClient(name) {
  const ws = new WebSocket(URL)
  ws.name = name
  ws.on('open', () => console.log(`[${name}] open`))
  ws.on('message', (m) => {
    console.log(`[${name}] recv:`, m.toString())
  })
  ws.on('close', () => console.log(`[${name}] close`))
  ws.on('error', (e) => console.log(`[${name}] error:`, e.message))
  return ws
}

function wait(ms){ return new Promise(r=>setTimeout(r, ms)) }

function waitForMessage(ws, predicate, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const onMsg = (m) => {
      try {
        const msg = JSON.parse(m.toString())
        if (predicate(msg)) {
          cleanup()
          resolve(msg)
        }
      } catch (e) {}
    }
    const onClose = () => { cleanup(); reject(new Error('socket closed')) }
    const onError = (e) => { cleanup(); reject(e) }
    const t = setTimeout(() => { cleanup(); reject(new Error('timeout')) }, timeout)
    function cleanup() { clearTimeout(t); ws.removeEventListener('message', onMsg); ws.removeEventListener('close', onClose); ws.removeEventListener('error', onError) }
    ws.addEventListener('message', onMsg)
    ws.addEventListener('close', onClose)
    ws.addEventListener('error', onError)
  })
}

;(async ()=>{
  const a = makeClient('A')
  await new Promise(r => a.once('open', r))
  a.send(JSON.stringify({ type: 'set_nick', nick: 'TesterA' }))
  await wait(200)
  // create/join room as player
  a.send(JSON.stringify({ type: 'join', roomId: null, role: 'player' }))

  let joinMsgA
  try {
    joinMsgA = await waitForMessage(a, m => m.type === 'joined', 5000)
  } catch (e) { console.error('[A] failed to join:', e.message); process.exit(2) }
  const roomId = joinMsgA.roomId
  console.log('[A] joined room', roomId, 'as', joinMsgA.symbol || joinMsgA.role)

  // bring up B
  const b = makeClient('B')
  await new Promise(r => b.once('open', r))
  b.send(JSON.stringify({ type: 'set_nick', nick: 'TesterB' }))
  await wait(200)
  b.send(JSON.stringify({ type: 'join', roomId, role: 'spectator' }))

  let joinMsgB
  try {
    joinMsgB = await waitForMessage(b, m => m.type === 'joined', 5000)
  } catch (e) { console.error('[B] failed to join:', e.message); process.exit(2) }
  console.log('[B] joined room', joinMsgB.roomId, 'as', joinMsgB.symbol || joinMsgB.role)

  console.log('Both clients joined; will have A leave in 1s')
  await wait(1000)

  console.log('A sending leave')
  a.send(JSON.stringify({ type: 'leave', roomId }))

  try {
    const leftMsg = await waitForMessage(a, m => m.type === 'left', 3000)
    console.log('[A] received left ack', leftMsg)
  } catch (e) { console.warn('[A] did not receive left ack:', e.message) }

  try {
    const stateAfter = await waitForMessage(b, m => m.type === 'state' && (!m.state.players || !m.state.players.X), 3000)
    console.log('[B] observed room update after A left:', JSON.stringify(stateAfter.state))
  } catch (e) { console.warn('[B] did not observe expected state change:', e.message) }

  console.log('closing clients')
  try { a.close() } catch (e) {}
  try { b.close() } catch (e) {}
  setTimeout(()=>process.exit(0), 500)
})()

