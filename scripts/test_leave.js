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

async function wait(ms){ return new Promise(r=>setTimeout(r, ms)) }

;(async ()=>{
  const a = makeClient('A')
  await new Promise(r => a.once('open', r))
  a.send(JSON.stringify({ type: 'set_nick', nick: 'TesterA' }))
  await wait(200)
  // create/join room as player
  a.send(JSON.stringify({ type: 'join', roomId: null, role: 'player' }))

  // wait for joined msg to learn roomId
  let roomId = null
  a.on('message', (m) => {
    try { const msg = JSON.parse(m.toString()); if (msg.type === 'joined') { roomId = msg.roomId; console.log('[A] joined room', roomId) } } catch(e){}
  })

  // bring up B
  const b = makeClient('B')
  await new Promise(r => b.once('open', r))
  b.send(JSON.stringify({ type: 'set_nick', nick: 'TesterB' }))
  // wait a bit for A to have roomId
  for (let i=0;i<10 && !roomId;i++){ await wait(200) }
  if (!roomId) { console.error('timed out waiting for roomId'); process.exit(2) }
  b.send(JSON.stringify({ type: 'join', roomId, role: 'spectator' }))

  console.log('Both clients joined; will have A leave in 1s')
  await wait(1000)
  console.log('A sending leave')
  a.send(JSON.stringify({ type: 'leave', roomId }))

  // wait to observe server broadcast
  await wait(1000)

  console.log('closing clients')
  try { a.close() } catch (e) {}
  try { b.close() } catch (e) {}
  setTimeout(()=>process.exit(0), 500)
})()
