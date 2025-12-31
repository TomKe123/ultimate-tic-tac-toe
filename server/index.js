/* 简单 WebSocket 服务器（演示用途）
 - 房间管理：roomId -> { clients: Set, players: {X: id, O: id}, spectators: Set, state }
 - 简单消息协议（JSON）：{ type, ... }
 - 支持 join（创建/加入），move，broadcast state
*/

const http = require('http')
const WebSocket = require('ws')
const { randomBytes } = require('crypto')

const server = http.createServer()
const wss = new WebSocket.Server({ server })

const rooms = {}

function makeRoomId() {
  return randomBytes(3).toString('hex')
}

function initState() {
  return {
    roomId: null,
    players: { X: null, O: null },
    clients: {},
    boards: Array.from({ length: 9 }, () => ({ cells: Array(9).fill(null), owner: null })),
    currentPlayer: 'X',
    nextAllowedBoard: -1, // -1 表示任意
    winner: null
  }
}

function checkWinner(cells) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ]
  for (const [a,b,c] of lines) {
    if (cells[a] && cells[a] === cells[b] && cells[b] === cells[c]) return cells[a]
  }
  if (cells.every(x => x)) return 'DRAW'
  return null
}

function checkBigWinner(boards) {
  const owners = boards.map(b => b.owner || null)
  const w = checkWinner(owners)
  return w
}

function broadcastRoom(room) {
  const state = JSON.parse(JSON.stringify(room.state))
  // attach player display names and spectator count
  state.players = {
    X: room.playerNames && room.playerNames.X ? room.playerNames.X : null,
    O: room.playerNames && room.playerNames.O ? room.playerNames.O : null
  }
  state.spectatorCount = Object.values(room.clients).filter(c => c && c.role === 'spectator').length
  const payload = JSON.stringify({ type: 'state', state })
  for (const c of Object.values(room.clients)) {
    if (c && c.readyState === WebSocket.OPEN) c.send(payload)
  }
}

wss.on('connection', (ws) => {
  ws.id = randomBytes(6).toString('hex')
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw)
      if (msg.type === 'join') {
        let roomId = msg.roomId || makeRoomId()
        if (!rooms[roomId]) {
          rooms[roomId] = { id: roomId, clients: {}, players: { X: null, O: null }, playerNames: {}, state: initState() }
          rooms[roomId].state.roomId = roomId
        }
        const room = rooms[roomId]
        room.clients[ws.id] = ws
        ws.roomId = roomId
        ws.role = msg.role || 'player'
        ws.nick = msg.nick || ('玩家-' + ws.id.slice(0,4))

        // assign player symbol if there is vacancy and caller asked to be player
        let assignedSymbol = null
        if (ws.role === 'player') {
          // prevent assigning same ws twice
          if (room.players.X === ws.id || room.players.O === ws.id) {
            // already assigned to a slot
            assignedSymbol = room.players.X === ws.id ? 'X' : 'O'
          } else if (!room.players.X) { room.players.X = ws.id; assignedSymbol = 'X'; room.playerNames.X = ws.nick }
          else if (!room.players.O) { room.players.O = ws.id; assignedSymbol = 'O'; room.playerNames.O = ws.nick }
          else {
            // room full for players -> become spectator
            ws.role = 'spectator'
          }
        }

        // prepare display players mapping for immediate response
        room.state.players = {
          X: room.playerNames.X || null,
          O: room.playerNames.O || null
        }

        ws.send(JSON.stringify({ type: 'joined', roomId, clientId: ws.id, symbol: assignedSymbol, role: ws.role, state: room.state }))
        broadcastRoom(room)
      }

      else if (msg.type === 'reset') {
        const room = rooms[msg.roomId]
        if (!room) { ws.send(JSON.stringify({ type: 'error', message: '房间不存在' })); return }
        const isPlayer = (room.players.X === ws.id) || (room.players.O === ws.id)
        if (!isPlayer) { ws.send(JSON.stringify({ type: 'error', message: '只有玩家可以重置游戏' })); return }
        room.state = initState()
        room.state.roomId = room.id
        broadcastRoom(room)
      }

      else if (msg.type === 'move') {
        const room = rooms[msg.roomId]
        if (!room) { ws.send(JSON.stringify({ type: 'error', message: '房间不存在' })); return }
        const s = room.state
        if (s.winner) { ws.send(JSON.stringify({ type: 'error', message: '游戏已结束' })); return }

        // validate that the sender is a player and symbol matches the turn
        const playerSymbol = room.players.X === ws.id ? 'X' : (room.players.O === ws.id ? 'O' : null)
        if (!playerSymbol) { ws.send(JSON.stringify({ type: 'error', message: '你不是玩家' })); return }
        if (playerSymbol !== s.currentPlayer) { ws.send(JSON.stringify({ type: 'error', message: '非你的回合' })); return }

        const boardIndex = msg.boardIndex
        const cellIndex = msg.cellIndex
        const board = s.boards[boardIndex]
        if (!board) { ws.send(JSON.stringify({ type: 'error', message: '小棋盘不存在' })); return }
        if (s.nextAllowedBoard !== -1 && s.nextAllowedBoard !== boardIndex) {
          ws.send(JSON.stringify({ type: 'error', message: '不允许在此小棋盘落子' })); return
        }
        if (board.owner) { ws.send(JSON.stringify({ type: 'error', message: '此小棋盘已被占领' })); return }
        if (board.cells[cellIndex]) { ws.send(JSON.stringify({ type: 'error', message: '格子已被占' })); return }

        // place
        board.cells[cellIndex] = playerSymbol
        // check small board
        const smallWin = checkWinner(board.cells)
        if (smallWin && smallWin !== 'DRAW') {
          board.owner = smallWin
          // fill all cells with owner's mark for display (optional - server side)
          board.cells = board.cells.map(_ => board.owner)
        }
        // compute big win
        const bigWin = checkBigWinner(s.boards)
        if (bigWin && bigWin !== 'DRAW') {
          s.winner = bigWin
        }

        // determine next allowed board (index = cellIndex)
        const next = s.boards[cellIndex]
        if (!next || next.owner || next.cells.every(x => x)) s.nextAllowedBoard = -1
        else s.nextAllowedBoard = cellIndex

        // toggle turn
        s.currentPlayer = s.currentPlayer === 'X' ? 'O' : 'X'

        // broadcast updated state
        broadcastRoom(room)
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: '消息格式错误' }))
    }
  })

  ws.on('close', () => {
    if (!ws.roomId) return
    const room = rooms[ws.roomId]
    if (!room) return
    delete room.clients[ws.id]
    if (room.players.X === ws.id) { room.players.X = null; if (room.playerNames) delete room.playerNames.X }
    if (room.players.O === ws.id) { room.players.O = null; if (room.playerNames) delete room.playerNames.O }
    // update state display map
    room.state.players = { X: room.playerNames && room.playerNames.X ? room.playerNames.X : null, O: room.playerNames && room.playerNames.O ? room.playerNames.O : null }
    broadcastRoom(room)
  })
})

server.listen(3000, () => console.log('WS server listening on :3000'))
