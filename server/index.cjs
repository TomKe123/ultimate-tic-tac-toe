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

// Apply a move for a given playerSymbol (used by human ws and AI)
function fixDuplicatePlayers(room) {
  if (!room) return
  if (room.players.X && room.players.O && room.players.X === room.players.O) {
    // clear O slot to resolve duplication
    room.players.O = null
    if (room.playerNames) delete room.playerNames.O
    console.log('[WS] Fixed duplicate player assignment for room', room.id)
    broadcastRoom(room)
  }
}

function applyMove(room, playerSymbol, boardIndex, cellIndex) {
  // defensive: ensure no duplicate player assignments
  fixDuplicatePlayers(room)
  const s = room.state
  if (s.winner) return { error: '游戏已结束' }
  if (playerSymbol !== s.currentPlayer) return { error: '非该玩家回合' }
  const board = s.boards[boardIndex]
  if (!board) return { error: '小棋盘不存在' }
  if (s.nextAllowedBoard !== -1 && s.nextAllowedBoard !== boardIndex) return { error: '不允许在此小棋盘落子' }
  if (board.owner) return { error: '此小棋盘已被占领' }
  if (board.cells[cellIndex]) return { error: '格子已被占' }

  // place
  board.cells[cellIndex] = playerSymbol
  // check small board
  const smallWin = checkWinner(board.cells)
  if (smallWin && smallWin !== 'DRAW') {
    board.owner = smallWin
    // fill all cells with owner's mark for display
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

  return { ok: true }
}

// AI utilities
function addAIToRoom(room, humanSymbol) {
  // AI takes the other symbol
  const aiSymbol = humanSymbol === 'X' ? 'O' : 'X'
  if (room.players[aiSymbol]) return false
  room.players[aiSymbol] = 'AI'
  room.ai = { symbol: aiSymbol, name: '机器人' }
  if (!room.playerNames) room.playerNames = {}
  room.playerNames[aiSymbol] = room.ai.name
  return true
}

function scheduleAIMove(room) {
  if (!room.ai) return
  const s = room.state
  if (s.winner) return
  if (s.currentPlayer !== room.ai.symbol) return
  if (room._aiTimer) return
  room._aiTimer = setTimeout(() => {
    room._aiTimer = null
    performAIMove(room)
  }, 400 + Math.floor(Math.random() * 500))
}

function assignPlayerSlot(room, slot, ws) {
  // slot: 'X' or 'O'
  if (slot !== 'X' && slot !== 'O') return null
  // remove ws from any slot it currently occupies (prevent duplicate occupancy)
  if (room.players.X === ws.id && slot === 'O') room.players.X = null
  if (room.players.O === ws.id && slot === 'X') room.players.O = null
  // set target slot
  room.players[slot] = ws.id
  if (!room.playerNames) room.playerNames = {}
  room.playerNames[slot] = ws.nick
  ws.role = 'player'
  return slot
}

function tryAssignPlayer(room, ws, desired) {
  // ensure no duplicate occupancy before assignment
  if (room.players.X && room.players.O && room.players.X === room.players.O) {
    // clear the O slot to resolve duplication (arbitrary choice)
    room.players.O = null
    if (room.playerNames) delete room.playerNames.O
    console.log('[WS] Fixed duplicate player assignment for room', room.id)
  }

  // Ensure this ws isn't assigned to any slot already
  if (room.players.X === ws.id) room.players.X = null
  if (room.players.O === ws.id) room.players.O = null

  // If desired symbol specified, try assign to it
  if (desired === 'X' || desired === 'O') {
    if (!room.players[desired]) {
      return assignPlayerSlot(room, desired, ws)
    }
    return null
  }

  // Otherwise, assign to first available slot
  if (!room.players.X) {
    return assignPlayerSlot(room, 'X', ws)
  }
  if (!room.players.O) {
    return assignPlayerSlot(room, 'O', ws)
  }
  return null
}

function performAIMove(room) {
  if (!room.ai) return
  const s = room.state
  if (s.winner) return
  if (s.currentPlayer !== room.ai.symbol) return

  // choose board
  let boardIdx = s.nextAllowedBoard
  if (boardIdx === -1) {
    const avail = s.boards.map((b, idx) => ({ b, idx })).filter(x => !x.b.owner && x.b.cells.some(c => !c))
    if (avail.length === 0) return
    boardIdx = avail[Math.floor(Math.random() * avail.length)].idx
  }
  const board = s.boards[boardIdx]
  const emptyCells = board.cells.map((c, idx) => ({ c, idx })).filter(x => !x.c)
  if (!emptyCells.length) return
  const cellIdx = emptyCells[Math.floor(Math.random() * emptyCells.length)].idx

  const res = applyMove(room, room.ai.symbol, boardIdx, cellIdx)
  if (res.error) {
    console.log('[AI] move failed:', res.error)
    return
  }
  broadcastRoom(room)
  // if after move it's still AI's turn (shouldn't be), schedule again
  scheduleAIMove(room)
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

function getLobbySnapshot() {
  // ensure rooms are consistent before snapshot
  for (const r of Object.values(rooms)) {
    if (r.players && r.players.X && r.players.O && r.players.X === r.players.O) {
      r.players.O = null
      if (r.playerNames) delete r.playerNames.O
      console.log('[WS] Fixed duplicate players during lobby snapshot for room', r.id)
    }
  }

  return Object.values(rooms).map(r => ({
    roomId: r.id,
    players: {
      X: r.playerNames && r.playerNames.X ? r.playerNames.X : (r.players.X === 'AI' && r.ai ? r.ai.name : null),
      O: r.playerNames && r.playerNames.O ? r.playerNames.O : (r.players.O === 'AI' && r.ai ? r.ai.name : null)
    },
    spectatorCount: Object.values(r.clients).filter(c => c && c.role === 'spectator').length,
    hasVacancy: !r.players.X || !r.players.O || r.players.X === 'AI' || r.players.O === 'AI',
    hostId: r.hostId || null,
    hostNick: r.playerNames && r.playerNames.X ? r.playerNames.X : null
  }))
}

function broadcastLobby() {
  const payload = JSON.stringify({ type: 'lobby', rooms: getLobbySnapshot() })
  for (const w of wss.clients) {
    if (w && w.readyState === WebSocket.OPEN) w.send(payload)
  }
}

function broadcastRoom(room) {
  const state = JSON.parse(JSON.stringify(room.state))
  // attach player display names and spectator count
  state.players = {
    X: room.playerNames && room.playerNames.X ? room.playerNames.X : (room.players.X === 'AI' && room.ai ? room.ai.name : null),
    O: room.playerNames && room.playerNames.O ? room.playerNames.O : (room.players.O === 'AI' && room.ai ? room.ai.name : null)
  }
  state.spectatorCount = Object.values(room.clients).filter(c => c && c.role === 'spectator').length
  // whether there's a playable vacancy (empty slot or AI present which can be replaced)
  state.hasVacancy = (!room.players.X || !room.players.O || room.players.X === 'AI' || room.players.O === 'AI')
  const payload = JSON.stringify({ type: 'state', state })
  for (const c of Object.values(room.clients)) {
    if (c && c.readyState === WebSocket.OPEN) c.send(payload)
  }
  // and lobby-level update
  broadcastLobby()
}

// helper to remove a client from its room (used for explicit leave and for logout)
function leaveRoom(ws) {
  if (!ws || !ws.roomId) return
  const room = rooms[ws.roomId]
  if (!room) { ws.roomId = null; ws.role = null; return }
  delete room.clients[ws.id]
  if (room.players.X === ws.id) { room.players.X = null; if (room.playerNames) delete room.playerNames.X }
  if (room.players.O === ws.id) { room.players.O = null; if (room.playerNames) delete room.playerNames.O }
  // update display mapping
  room.state.players = { X: room.playerNames && room.playerNames.X ? room.playerNames.X : null, O: room.playerNames && room.playerNames.O ? room.playerNames.O : null }
  // clear ws state
  ws.roomId = null
  ws.role = null
  // notify remaining clients and lobby
  broadcastRoom(room)
  try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'left', roomId: room.id })) } catch (e) {}
  broadcastLobby()
}

wss.on('connection', (ws) => {
  ws.id = randomBytes(6).toString('hex')
  console.log('[WS] connected', ws.id, new Date().toISOString())

  // helper to check nickname availability across all connected clients
  function isNickAvailable(nick) {
    if (!nick) return false
    for (const c of wss.clients) {
      if (c && c.readyState === WebSocket.OPEN && c.nick && c.nick.toLowerCase() === nick.toLowerCase()) return false
    }
    return true
  }

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw)

      // handle nickname set / login
      if (msg.type === 'set_nick') {
        const nick = (msg.nick || '').trim()
        if (!nick || nick.length < 2 || nick.length > 20) {
          ws.send(JSON.stringify({ type: 'nick_taken', message: '昵称需为 2-20 个字符', attempted: nick }))
          return
        }
        if (!isNickAvailable(nick)) {
          ws.send(JSON.stringify({ type: 'nick_taken', message: '昵称已被占用', attempted: nick }))
          return
        }
        ws.nick = nick
        ws.send(JSON.stringify({ type: 'nick_ok', nick }))
        // broadcast lobby so names update
        broadcastLobby()
        return
      }

      if (msg.type === 'join') {
        console.log('[WS] join request', ws.id, msg)
        let roomId = msg.roomId || makeRoomId()
        if (!rooms[roomId]) {
          rooms[roomId] = { id: roomId, clients: {}, players: { X: null, O: null }, playerNames: {}, state: initState() }
          rooms[roomId].state.roomId = roomId
        }
        const room = rooms[roomId]
        room.clients[ws.id] = ws
        ws.roomId = roomId
        // set hostId when room is created and first join occurs
        if (!room.hostId) room.hostId = ws.id
        ws.role = msg.role || 'player'
        // require prior nickname login; fall back to generated nick if not set
        if (!ws.nick) {
          // if client supplied a nick in join and it's available, accept it as a convenience
          const candidate = (msg.nick || '').trim()
          if (candidate && isNickAvailable(candidate)) ws.nick = candidate
          else ws.nick = '玩家-' + ws.id.slice(0,4)
        }

        // assign player symbol if caller asked to be player
        let assignedSymbol = null
        if (ws.role === 'player') {
          assignedSymbol = tryAssignPlayer(room, ws, null)
          if (!assignedSymbol) {
            // room full for players -> become spectator
            ws.role = 'spectator'
          }
        }

        // if the join request asked to play with AI, try to create an AI in the other slot
        if (msg.playWithAi && assignedSymbol) {
          const ok = addAIToRoom(room, assignedSymbol)
          if (ok) console.log('[WS] AI added to room', roomId, 'as', room.ai.symbol)
        }

        // prepare display players mapping for immediate response
        room.state.players = {
          X: room.playerNames.X || (room.players.X === 'AI' ? (room.ai && room.ai.name) : null),
          O: room.playerNames.O || (room.players.O === 'AI' ? (room.ai && room.ai.name) : null)
        }

        ws.send(JSON.stringify({ type: 'joined', roomId, clientId: ws.id, symbol: assignedSymbol, role: ws.role, state: room.state }))
        console.log('[WS] joined', ws.id, 'room', roomId, 'as', ws.role, assignedSymbol)
        broadcastRoom(room)

        // if AI is present and it's AI's turn, schedule its move
        if (room.ai) scheduleAIMove(room)
        // broadcast lobby changes
        broadcastLobby()
      }

      else if (msg.type === 'logout') {
        // clear nick for this ws and leave room if in one
        if (ws.nick) {
          delete ws.nick
          ws.send(JSON.stringify({ type: 'logged_out' }))
          // attempt to leave room too
          try { leaveRoom(ws) } catch (e) {}
          // update lobby display
          broadcastLobby()
        }
      }

      else if (msg.type === 'leave') {
        // explicit leave room request
        try {
          leaveRoom(ws)
        } catch (e) { }
        return
      }

      else if (msg.type === 'reset') {
        const room = rooms[msg.roomId]
        if (!room) { ws.send(JSON.stringify({ type: 'error', message: '房间不存在' })); return }
        const isPlayer = (room.players.X === ws.id) || (room.players.O === ws.id)
        if (!isPlayer) { ws.send(JSON.stringify({ type: 'error', message: '只有玩家可以重置游戏' })); return }
        room.state = initState()
        room.state.roomId = room.id
        broadcastRoom(room)
        broadcastLobby()
      }

      else if (msg.type === 'move') {
        const room = rooms[msg.roomId]
        if (!room) { ws.send(JSON.stringify({ type: 'error', message: '房间不存在' })); return }
        const s = room.state
        if (s.winner) { ws.send(JSON.stringify({ type: 'error', message: '游戏已结束' })); return }

        // validate that the sender is a player and symbol matches the turn
        const playerSymbol = room.players.X === ws.id ? 'X' : (room.players.O === ws.id ? 'O' : null)
        if (!playerSymbol) { ws.send(JSON.stringify({ type: 'error', message: '你不是玩家' })); return }

        const boardIndex = msg.boardIndex
        const cellIndex = msg.cellIndex
        const res = applyMove(room, playerSymbol, boardIndex, cellIndex)
        if (res.error) { ws.send(JSON.stringify({ type: 'error', message: res.error })); return }

        // broadcast updated state
        broadcastRoom(room)

        // if AI is present and it's AI's turn, schedule its move
        if (room.ai) scheduleAIMove(room)
      }

      else if (msg.type === 'request_lobby') {
        ws.send(JSON.stringify({ type: 'lobby', rooms: getLobbySnapshot() }))
      }

      else if (msg.type === 'switch_role') {
        const room = rooms[msg.roomId]
        if (!room) { ws.send(JSON.stringify({ type: 'error', message: '房间不存在' })); return }
        const target = msg.role // 'spectator' or 'player'
        // switching TO spectator: free player slot if currently a player
        if (target === 'spectator') {
          if (room.players.X === ws.id) { room.players.X = null; if (room.playerNames) delete room.playerNames.X }
          if (room.players.O === ws.id) { room.players.O = null; if (room.playerNames) delete room.playerNames.O }
          ws.role = 'spectator'
          broadcastRoom(room)
          ws.send(JSON.stringify({ type: 'switched', role: 'spectator' }))
          broadcastLobby()
          return
        }
        // switching TO player: try to take empty slot, else replace AI if present
        if (target === 'player') {
          // try safe assign (removes ws from other slot first)
          const assigned = tryAssignPlayer(room, ws, null)
          if (assigned) {
            ws.send(JSON.stringify({ type: 'switched', role: 'player', symbol: assigned }))
            broadcastRoom(room)
            broadcastLobby()
            // if AI exists and it's its turn, schedule
            if (room.ai) scheduleAIMove(room)
            return
          }

          // replace AI if present (assign to that slot)
          if (room.players.X === 'AI') {
            assignPlayerSlot(room, 'X', ws)
            if (room.ai) delete room.ai
            ws.send(JSON.stringify({ type: 'switched', role: 'player', symbol: 'X' }))
            broadcastRoom(room)
            broadcastLobby()
            return
          }
          if (room.players.O === 'AI') {
            assignPlayerSlot(room, 'O', ws)
            if (room.ai) delete room.ai
            ws.send(JSON.stringify({ type: 'switched', role: 'player', symbol: 'O' }))
            broadcastRoom(room)
            broadcastLobby()
            return
          }

          ws.send(JSON.stringify({ type: 'error', message: '没有可用玩家位置' }))
          return
        }
      }
    } catch (e) {
      console.error('[WS] message error', e)
      ws.send(JSON.stringify({ type: 'error', message: '消息格式错误' }))
    }
  })

  ws.on('close', () => {
    console.log('[WS] disconnected', ws.id)
    if (!ws.roomId) return
    const room = rooms[ws.roomId]
    if (!room) return
    delete room.clients[ws.id]
    if (room.players.X === ws.id) { room.players.X = null; if (room.playerNames) delete room.playerNames.X }
    if (room.players.O === ws.id) { room.players.O = null; if (room.playerNames) delete room.playerNames.O }
    // update state display map
    room.state.players = { X: room.playerNames && room.playerNames.X ? room.playerNames.X : null, O: room.playerNames && room.playerNames.O ? room.playerNames.O : null }
    broadcastRoom(room)
    // lobby update
    broadcastLobby()
  })
})

server.listen(3000, () => console.log('WS server listening on :3000'))
