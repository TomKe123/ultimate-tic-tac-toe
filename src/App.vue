<template>
  <div class="app">
    <header>
      <h1>复合井字棋（在线）</h1>
    </header>

    <main>
      <!-- 登录面板或控制栏 -->
      <section class="controls">
        <login-panel v-if="!loggedIn" :error="loginError" @login="handleLogin" />

        <div v-else class="control-panel">
          <!-- 第一行：登录和房间信息 -->
          <div class="control-row">
            <div class="input-group">
              <input v-model="nick" placeholder="昵称（可选）" />
              <button @click="logout" class="danger">注销</button>
            </div>
            
            <div class="input-group">
              <input v-model="roomId" placeholder="房间号（空为新建）" />
              <select v-model="role">
                <option value="player">玩家</option>
                <option value="spectator">观战</option>
              </select>
            </div>

            <button 
              v-if="role === 'player'"
              @click="playWithAi = !playWithAi"
              :class="['ai-toggle', { active: playWithAi }]"
              :title="playWithAi ? '关闭机器人' : '启用机器人对战'">
              <span class="ai-icon">🤖</span>
              <span class="ai-label">{{ playWithAi ? '机器人ON' : '机器人' }}</span>
            </button>

            <div class="status-group">
              <div class="status">WS: <strong v-if="connected" class="connected">已连接</strong><strong v-else class="disconnected">未连接</strong></div>
              <div class="client-id">ID: <strong>{{ clientId?.slice(0, 8) ?? '-' }}</strong></div>
            </div>
          </div>

          <!-- 第二行：操作按钮 -->
          <div class="control-row buttons-row">
            <button class="primary" @click="join">加入/创建</button>
            <button @click="resetGame" :disabled="!roomId">重置游戏</button>
            <button @click="reconnect">重新连接</button>
            <button @click="leaveRoom" :disabled="!roomId">退出房间</button>
            <button @click="clearLogs">清空日志</button>
            <share-panel v-if="roomId" :room-id="roomId" />
          </div>
        </div>
      </section>

      <!-- 大厅面板（仅在非游戏状态显示） -->
      <aside v-if="!isPlaying && !state" class="lobby-section">
        <lobby-panel :rooms="lobbyRooms" @refresh="requestLobby" @join="joinFromLobby" @spectate="spectateFromLobby" />
      </aside>
      <div class="error" v-if="lastError">错误：{{ lastError }}</div>

      <section v-if="state" class="game-area">
        <div class="top-row">
          <!-- 观战模式下显示大厅 -->
          <aside v-if="!isPlaying" class="lobby-in-game">
            <lobby-panel :rooms="lobbyRooms" @refresh="requestLobby" @join="joinFromLobby" @spectate="spectateFromLobby" />
          </aside>
          
          <div class="meta-card">
            <div class="meta-row meta-header">
              <div class="room-badge">
                <span class="label">房间</span>
                <span class="value">{{ state.roomId }}</span>
              </div>
              <button class="copy-btn" @click="copyRoomId">复制</button>
            </div>

            <div class="meta-row">
              <div class="identity-section">
                <span class="label">身份</span>
                <span class="player-label">{{ clientRoleLabel }}</span>
              </div>
              <div class="spectator-count">
                <span class="label">观战</span>
                <span class="value">{{ state.spectatorCount ?? 0 }}</span>
              </div>
            </div>

            <div class="meta-row players-section">
              <div class="player-card" :class="{ active: state.currentPlayer === 'X' }">
                <div class="player-symbol">X</div>
                <div class="player-name">{{ state.players.X ?? '等待玩家' }}</div>
              </div>
              <div class="vs-divider">vs</div>
              <div class="player-card" :class="{ active: state.currentPlayer === 'O' }">
                <div class="player-symbol">O</div>
                <div class="player-name">{{ state.players.O ?? '等待玩家' }}</div>
              </div>
            </div>

            <div class="meta-row status-section">
              <div class="status-item">
                <span class="label">当前回合</span>
                <span class="turn-badge" :class="state.currentPlayer === 'X' ? 'turn-x' : 'turn-o'">{{ state.currentPlayer }}</span>
              </div>
              <div class="status-item">
                <span class="label">可落子</span>
                <span class="board-badge">{{ state.nextAllowedBoard === -1 ? '任意' : `#${state.nextAllowedBoard}` }}</span>
              </div>
            </div>

            <div class="helper-section">
              <div class="helper-text" :class="{ canMove: isMyTurn }">
                {{ helperText }}
              </div>
              <div class="action-buttons">
                <button v-if="meSymbol" @click="switchToSpectator" class="small">切换观战</button>
                <button v-else @click="switchToPlayer" :disabled="!state.hasVacancy" :title="!state.hasVacancy ? '当前无空位或无法替换 AI' : '请求成为玩家'" class="small">加入游戏</button>
              </div>
            </div>

            <!-- incoming join requests (visible to players) -->
            <div v-if="pendingJoinRequests.length && isPlaying" class="meta-row requests">
              <div class="muted">加入请求：</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <div v-for="(r, idx) in pendingJoinRequests" :key="r.id" style="background:#fff8eb;border:1px solid #ffdca3;padding:6px 8px;border-radius:8px;display:flex;gap:8px;align-items:center">
                  <div>{{ r.nick }}</div>
                  <button @click="dismissRequest(idx)">忽略</button>
                </div>
              </div>
            </div>
          </div>

          <div class="log" aria-live="polite">
            <div class="log-header"><h4>消息</h4><small class="muted">（仅保留最近 200 条）</small></div>
            <div class="log-list" ref="logList">
              <div v-for="(m, idx) in logs.slice(0,200)" :key="idx" class="log-item">{{ m }}</div>
            </div>
          </div>
        </div>

        <div v-if="state.winner" class="winner-overlay">
          <div class="winner-card">
            <div class="winner-text">胜者</div>
            <div class="winner-symbol" :class="state.winner === 'X' ? 'turn-x' : 'turn-o'">{{ state.winner }}</div>
            <button @click="resetGame" class="primary">重新开始</button>
          </div>
        </div>

        <div class="board-wrapper">
          <ultimate-board
            :state="state"
            :meSymbol="meSymbol"
            :clientId="clientId"
            @move="sendMove"
          />
        </div>
      </section>

      <section v-else class="hint">
        <p>请加入或创建房间来开始游戏（支持观战）。</p>
      </section>
    </main>

    <footer>
      <small>说明：规则为“嵌套井字棋”/Ultimate Tic-Tac-Toe。服务器为简单示例，仅用于学习与本地运行。</small>
    </footer>
  </div>
</template>

<script>
import UltimateBoard from './components/UltimateBoard.vue'
import SharePanel from './components/SharePanel.vue'
import LobbyPanel from './components/LobbyPanel.vue'
import LoginPanel from './components/LoginPanel.vue'

const WS_URL = (() => {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL
  if (typeof location !== 'undefined') {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const port = import.meta.env.DEV ? '3000' : (location.port || '')
    const host = port ? `${location.hostname}:${port}` : location.hostname
    return `${proto}//${host}`
  }
  return 'ws://localhost:3000'
})()

export default {
  name: 'App',
  components: { UltimateBoard, SharePanel, LobbyPanel, LoginPanel },
  mounted() {
    // 如果 URL 中包含 room 参数，自动填入房间号（便于通过分享链接进入）
    try {
      const sp = new URLSearchParams(location.search)
      const r = sp.get('room')
      if (r) this.roomId = r
    } catch (e) {}

    // request initial lobby list when mounted (if connected later, we also request on open)
    this.lobbyRooms = []

    // auto-scroll log on updates
    this.$watch('logs', () => {
      this.$nextTick(() => {
        const el = this.$refs.logList
        if (el) el.scrollTop = 0 // newest at top
      })
    })

    // initialize login state
    this.loggedIn = false
    this.loginError = null

    // auto-login from cookie if present
    const saved = this.getCookie('uttt_nick')
    if (saved && saved.length) {
      // attempt to set nick on server
      this.handleLogin(saved)
    }

    // 在页面卸载/关闭时尝试主动注销昵称，保证昵称被及时释放
    this._onBeforeUnload = () => {
      try { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.send({ type: 'logout' }) } catch (e) {}
    }
    window.addEventListener('beforeunload', this._onBeforeUnload)
  },
  beforeUnmount() {
    try { window.removeEventListener('beforeunload', this._onBeforeUnload) } catch (e) {}
  },
  data() {
    return {
      url: WS_URL,
      ws: null,
      connected: false,
      roomId: '',
      role: 'player',
      playWithAi: false,
      playInLobby: false,
      nick: '',
      loggedIn: false,
      loginError: null,
      state: null,
      logs: [],
      lobbyRooms: [],
      clientId: null,
      meSymbol: null,
      lastError: null,
      // 存放收到的“加入玩家”请求（只对玩家可见）
      pendingJoinRequests: []
    }
  },
  computed: {
    clientRoleLabel() {
      if (!this.state) return this.role
      if (this.state.players[this.meSymbol]) return this.meSymbol
      return this.role
    },
    isPlaying() {
      return !!this.meSymbol
    },
    isMyTurn() {
      if (!this.meSymbol || !this.state) return false
      return this.state.currentPlayer === this.meSymbol
    },
    helperText() {
      if (!this.state) return ''
      if (!this.meSymbol) return '当前为观战者，可观看或申请成为玩家。'
      if (this.state.winner) return `游戏已结束，胜者：${this.state.winner}`
      if (this.isMyTurn) return '轮到你落子。请选择可落子小格中的空位。'
      return '等待对手操作...'
    }
  },
  methods: {
    connect() {
      if (this.ws) return
      this.ws = new WebSocket(this.url)
      this.ws.addEventListener('open', () => { this.connected = true; this.log('已连接'); /* requestLobby happens after login */ })
      this.ws.addEventListener('message', (ev) => this.onMessage(ev))
      this.ws.addEventListener('close', () => { this.connected = false; this.log('已断开'); this.ws = null })
      this.ws.addEventListener('error', (e) => this.log('WS 错误'))
    },

    // cookie helpers
    setCookie(name, value, days = 30) {
      const d = new Date()
      d.setTime(d.getTime() + (days*24*60*60*1000))
      const expires = "expires=" + d.toUTCString()
      document.cookie = `${name}=${encodeURIComponent(value)};${expires};path=/`;
    },
    getCookie(name) {
      const v = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)')
      return v ? decodeURIComponent(v.pop()) : ''
    },
    deleteCookie(name) {
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    },
    resetGame() {
      if (!this.roomId) return
      this.send({ type: 'reset', roomId: this.roomId })
    },
    send(payload) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) { this.log('WS 未就绪'); return }
      this.ws.send(JSON.stringify(payload))
    },
    requestLobby() {
      if (!this.loggedIn) return
      this.send({ type: 'request_lobby' })
    },
    handleLogin(nick) {
      this.loginError = null
      this.connect()
      const sendNick = () => this.send({ type: 'set_nick', nick })
      if (this.ws && this.ws.readyState === WebSocket.OPEN) sendNick()
      else {
        const once = () => { sendNick(); this.ws.removeEventListener('open', once); }
        this.ws.addEventListener('open', once)
      }
    },
    join() {
      if (!this.loggedIn) { this.loginError = '请先登录昵称'; return }
      this.connect()
      const payload = { type: 'join', roomId: this.roomId || null, role: this.role, playWithAi: this.playWithAi }
      this.send(payload)
    },
    joinFromLobby(roomId) {
      if (!this.loggedIn) { this.loginError = '请先登录昵称'; return }
      // try to join as player (will become spectator if no vacancy)
      this.connect()
      this.roomId = roomId
      this.send({ type: 'join', roomId, role: 'player' })
    },
    spectateFromLobby(roomId) {
      if (!this.loggedIn) { this.loginError = '请先登录昵称'; return }
      this.connect()
      this.roomId = roomId
      this.send({ type: 'join', roomId, role: 'spectator' })
    },
    switchToSpectator() {
      if (!this.roomId) return
      this.send({ type: 'switch_role', roomId: this.roomId, role: 'spectator' })
    },
    switchToPlayer() {
      if (!this.roomId) return
      this.send({ type: 'switch_role', roomId: this.roomId, role: 'player' })
    },
    onMessage(ev) {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'nick_ok') {
          this.loggedIn = true
          this.nick = msg.nick
          this.loginError = null
          this.log('昵称已注册：' + msg.nick)
          // persist nick in cookie
          try { this.setCookie('uttt_nick', msg.nick, 30) } catch (e) {}
          // after login, request lobby snapshot
          this.requestLobby()
          return
        }
        if (msg.type === 'nick_taken') {
          // if auto-login from cookie failed, clear cookie
          if (this.getCookie('uttt_nick') === (msg.attempted || '')) this.deleteCookie('uttt_nick')
          this.loginError = msg.message || '昵称已被占用'
          return
        }
        if (msg.type === 'joined') {
          this.clientId = msg.clientId
          this.roomId = msg.roomId
          this.meSymbol = msg.symbol || null
          this.state = msg.state
          this.log(`已加入 ${msg.roomId}，身份：${msg.symbol ?? msg.role}`)
        } else if (msg.type === 'state') {
          this.state = msg.state
          // clear transient errors
          this.lastError = null
        } else if (msg.type === 'lobby') {
          this.lobbyRooms = msg.rooms || []
        } else if (msg.type === 'switched') {
          this.role = msg.role
          // ensure local meSymbol is cleared if becoming spectator
          this.meSymbol = msg.symbol || null
          this.log('已切换为：' + msg.role)
        } else if (msg.type === 'join_request') {
          // notify current players about spectator's request
          const from = msg.from || { id: '', nick: '未知' }
          // if current client is a player, record the request and log it
          if (this.isPlaying) {
            this.pendingJoinRequests.unshift(from)
            // keep only 10 recent
            if (this.pendingJoinRequests.length > 10) this.pendingJoinRequests.pop()
            this.log(`玩家请求加入：${from.nick}`)
          } else {
            // otherwise, ignore (or log for records)
            this.log(`收到加入请求（发送给玩家）：${from.nick}`)
          }
        } else if (msg.type === 'left') {
          // server acknowledged we left the room
          this.log('已退出房间')
          this.roomId = ''
          this.state = null
          this.meSymbol = null
        } else if (msg.type === 'error') {
          this.lastError = msg.message
          this.log('错误：' + msg.message)
          setTimeout(() => this.lastError = null, 5000)
        }
      } catch (e) { this.log('消息解析出错') }
    },
    sendMove({ boardIndex, cellIndex }) {
      this.send({ type: 'move', roomId: this.roomId, boardIndex, cellIndex })
    },
    reconnect() {
      if (this.ws) this.ws.close()
      this.ws = null
      this.connect()
    },
    clearLogs() { this.logs = [] },
    leaveRoom() {
      if (!this.roomId) return
      try { this.send({ type: 'leave', roomId: this.roomId }) } catch (e) {}
      // optimistic local clear; server will also confirm with a 'left' message
      this.roomId = ''
      this.state = null
      this.meSymbol = null
      this.pendingJoinRequests = []
      this.log('正在退出房间...')
    },
    dismissRequest(idx) {
      this.pendingJoinRequests.splice(idx, 1)
    },
    copyRoomId() {
      if (!this.roomId) return
      const text = this.roomId
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => this.log('已复制房间号')).catch(() => { try { prompt('复制房间号：', text) } catch (e) {} })
      } else {
        try { prompt('复制房间号：', text) } catch (e) { }
      }
    },
    logout() {
      // ensure we leave any room first
      try { if (this.roomId) this.send({ type: 'leave', roomId: this.roomId }) } catch (e) {}
      try { this.send({ type: 'logout' }) } catch (e) {}
      try { this.deleteCookie('uttt_nick') } catch (e) {}
      this.loggedIn = false
      this.nick = ''
      this.loginError = null
      this.log('已注销')
    },
    log(text) { this.logs.unshift(new Date().toLocaleTimeString() + ' ' + text) }
  }
}
</script>

<style scoped>
.app { 
  font-family: inherit;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
}

header {
  flex-shrink: 0;
}

main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 20px;
}

footer {
  flex-shrink: 0;
}

.controls {
  flex-shrink: 0;
}

.control-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #fff;
  padding: 12px;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  border: 1px solid #e2e8f0;
}

.control-row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.control-row.buttons-row {
  gap: 8px;
}

.control-row.buttons-row button,
.control-row.buttons-row > div {
  flex: 1 1 auto;
  min-width: 80px;
}

.input-group {
  display: flex;
  gap: 8px;
  align-items: center;
  flex: 1 1 auto;
}

.input-group input,
.input-group select {
  padding: 8px 10px;
  border-radius: var(--radius-md);
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #1e293b;
  font-size: 0.9rem;
  transition: border-color 0.2s;
}

.input-group input:focus,
.input-group select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.input-group input {
  flex: 1 1 auto;
  min-width: 120px;
}

.input-group select {
  flex: 0 1 auto;
  min-width: 90px;
}

/* AI 对战按钮 */
.ai-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 2px solid #cbd5e1;
  background: #fff;
  color: #1e293b;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
  flex: 0 1 auto;
}

.ai-toggle:hover {
  border-color: #7c3aed;
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
  background: #faf5ff;
}

.ai-toggle.active {
  background: linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%);
  color: #fff;
  border-color: #7c3aed;
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
}

.ai-toggle.active:hover {
  box-shadow: 0 6px 20px rgba(124, 58, 237, 0.4);
  transform: translateY(-1px);
}

.ai-toggle:active:not(:disabled) {
  transform: translateY(0);
}

.ai-toggle:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ai-icon {
  font-size: 1rem;
  display: inline-block;
}

.ai-label {
  font-size: 0.9rem;
}

.checkbox-group {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9rem;
  color: #334155;
  white-space: nowrap;
  flex: 0 1 auto;
}

.checkbox-group input[type="checkbox"] {
  cursor: pointer;
  width: 16px;
  height: 16px;
}

.status-group {
  display: flex;
  gap: 12px;
  align-items: center;
  flex: 0 1 auto;
}

.status,
.client-id {
  font-size: 0.85rem;
  color: var(--muted);
  white-space: nowrap;
}

.status strong,
.client-id strong {
  color: #1e293b;
  font-weight: 700;
}

.connected {
  color: var(--success) !important;
}

.disconnected {
  color: #dc2626 !important;
}

button.danger {
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fca5a5;
}

button.danger:hover {
  border-color: #dc2626;
  box-shadow: 0 2px 8px rgba(220, 38, 38, 0.2);
}

.lobby-section {
  flex-shrink: 0;
  max-height: 240px;
  overflow: hidden;
  margin: 0;
  border-radius: var(--radius-lg);
}

.lobby-section .lobby-panel {
  max-height: 240px;
  overflow-y: auto;
}

.log {
  background: linear-gradient(135deg, #f8fafc 0%, #f0f4f8 100%);
  padding: 12px;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  border: 1px solid #e2e8f0;
}

.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 2px solid #cbd5e1;
}

.log-header h4 {
  margin: 0;
  color: #1e293b;
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.log-header small {
  color: var(--muted);
  font-size: 0.8rem;
}

.log-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column-reverse;
  min-height: 0;
  gap: 4px;
  padding: 4px 0;
}

.log-list::-webkit-scrollbar {
  width: 6px;
}

.log-list::-webkit-scrollbar-track {
  background: transparent;
}

.log-list::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}

.log-list::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.log-item {
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  color: #475569;
  font-family: 'Courier New', monospace;
  transition: all 0.2s;
  border-left: 2px solid transparent;
  background: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-item:hover {
  background: #f1f5f9;
  border-left-color: var(--accent);
}

/* 日志条目根据内容着色 */
.log-item:nth-child(1) {
  border-left-color: #10b981;
  background: rgba(16, 185, 129, 0.05);
}

.log-item:nth-child(2) {
  border-left-color: #3b82f6;
  background: rgba(59, 130, 246, 0.05);
}

aside {
  flex-shrink: 0;
  max-height: 200px;
  overflow-y: auto;
}

.game-area { 
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.top-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  min-height: 0;
  overflow: visible;
  flex-wrap: wrap;
  width: 100%;
  max-width: 1200px;
  flex-shrink: 0;
}

/* 观战模式下的大厅面板 */
.lobby-in-game {
  flex: 1;
  min-width: 280px;
  max-height: 500px;
  overflow-y: auto;
  background: #fff;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  border: 1px solid #e2e8f0;
}

.top-row .meta-card {
  width: 100%;
  max-width: 380px;
  flex-shrink: 0;
  background: #fff;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  border: 1px solid #e2e8f0;
  padding: 16px;
}

.top-row .log {
  flex: 1;
  min-width: 300px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 500px;
}

/* 美化对局信息卡片 */
.meta-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.95rem;
  padding: 12px 0;
  border-bottom: 1px solid #e2e8f0;
  flex-wrap: wrap;
}

.meta-row:last-child {
  border-bottom: none;
}

.meta-row.meta-header {
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid #e2e8f0;
  padding-bottom: 14px;
  margin-bottom: 4px;
}

/* 房间信息徽章 */
.room-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(135deg, #f0f7ff 0%, #eef2ff 100%);
  border: 1px solid rgba(37, 99, 235, 0.2);
  border-radius: var(--radius-md);
  flex: 1;
}

.room-badge .label {
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.room-badge .value {
  color: var(--accent);
  font-weight: 700;
  font-family: 'Courier New', monospace;
  font-size: 0.95rem;
}

.copy-btn {
  padding: 7px 12px;
  font-size: 0.85rem;
  background: white;
  border: 1px solid #cbd5e1;
  color: var(--accent);
  font-weight: 600;
  min-width: auto;
}

.copy-btn:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

/* 身份和观战信息 */
.identity-section {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.identity-section .label {
  color: var(--muted);
  font-size: 0.9rem;
  font-weight: 600;
}

.spectator-count {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: #f1f5f9;
  border-radius: var(--radius-sm);
}

.spectator-count .label {
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 600;
}

.spectator-count .value {
  color: #1e293b;
  font-weight: 700;
  font-size: 0.95rem;
}

/* 玩家卡片 */
.players-section {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 0;
  flex-wrap: nowrap;
  border-bottom: 2px solid #e2e8f0;
  margin: 4px 0;
}

.player-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex: 1;
  padding: 12px;
  background: #f9fafb;
  border: 2px solid #e2e8f0;
  border-radius: var(--radius-md);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.player-card.active {
  background: linear-gradient(135deg, #f0f7ff 0%, #eef2ff 100%);
  border-color: var(--accent);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.1);
  transform: scale(1.05);
}

.player-symbol {
  font-size: 1.8rem;
  font-weight: 900;
  color: #1e293b;
  line-height: 1;
}

.player-card.active .player-symbol {
  font-size: 2rem;
}

.player-name {
  font-size: 0.85rem;
  color: var(--muted);
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.player-card.active .player-name {
  color: var(--accent);
  font-weight: 700;
}

.vs-divider {
  color: #cbd5e1;
  font-weight: 900;
  font-size: 1.2rem;
  margin: 0 4px;
}

/* 状态信息 */
.status-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 2px solid #e2e8f0;
  margin: 4px 0;
}

.status-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  background: #f9fafb;
  border-radius: var(--radius-md);
  text-align: center;
}

.status-item .label {
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.turn-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  font-size: 1.4rem;
  font-weight: 900;
  color: white;
  margin: 0 auto;
}

.turn-badge.turn-x {
  background: linear-gradient(135deg, var(--x-color) 0%, #dc2626 100%);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

.turn-badge.turn-o {
  background: linear-gradient(135deg, var(--o-color) 0%, #0284c7 100%);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.board-badge {
  display: inline-block;
  padding: 6px 10px;
  background: linear-gradient(135deg, #f0f4f8, #f9fafb);
  border: 1px solid #cbd5e1;
  border-radius: var(--radius-sm);
  font-weight: 700;
  font-size: 0.9rem;
  color: #1e293b;
}

/* 帮助文本 */
.helper-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 0;
}

.helper-text {
  padding: 12px;
  background: #f9fafb;
  border-radius: var(--radius-md);
  border-left: 3px solid #cbd5e1;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.5;
  transition: all 0.2s;
}

.helper-text.canMove {
  border-left-color: var(--success);
  background: linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%);
  color: #065f46;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.1);
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.action-buttons button {
  flex: 1;
  padding: 9px 12px;
  font-size: 0.9rem;
}

.action-buttons button.small {
  padding: 8px 12px;
  font-size: 0.85rem;
}

/* 加入请求 */
.requests {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-start;
  border-bottom: none;
  padding: 12px;
  background: linear-gradient(135deg, #fef3c7 0%, #fef08a 100%);
  border-radius: var(--radius-md);
  margin: 0;
  border: 1px solid #fde047;
}

.log-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column-reverse;
  min-height: 0;
}

.log-item {
  padding: 8px 10px;
  border-bottom: 1px solid #f1f5f9;
  font-size: 0.9rem;
  color: #475569;
  font-family: monospace;
  flex-shrink: 0;
}

.log-item:hover {
  background: #f8fafc;
}

.hint {
  color: var(--muted);
  padding: 16px;
  text-align: center;
  background: #f9fafb;
  border-radius: var(--radius-lg);
  border: 1px dashed #cbd5e1;
}

.board-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
}

.winner-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: 50;
  animation: fadeIn 0.2s ease;
}

/* PC 端优化（1920x1080） */
@media (min-width: 1400px) {
  .app {
    padding: 12px;
    gap: 12px;
  }

  header {
    padding: 12px 0;
  }

  main {
    gap: 8px;
    padding: 0;
  }

  .controls {
    flex-shrink: 0;
  }

  .control-panel {
    padding: 10px;
    gap: 8px;
  }

  .control-row {
    gap: 8px;
  }

  .control-row.buttons-row {
    gap: 6px;
  }

  .control-row.buttons-row button,
  .control-row.buttons-row > div {
    min-width: 70px;
  }

  .input-group {
    gap: 6px;
  }

  .input-group input,
  .input-group select {
    padding: 7px 9px;
    font-size: 0.85rem;
  }

  .ai-toggle {
    padding: 7px 10px;
    font-size: 0.85rem;
  }

  .ai-icon {
    font-size: 0.95rem;
  }

  .checkbox-group {
    font-size: 0.85rem;
  }

  .status-group {
    gap: 10px;
  }

  .status,
  .client-id {
    font-size: 0.8rem;
  }

  .lobby-section {
    max-height: 200px;
  }

  .lobby-in-game {
    max-height: 75vh;
  }

  .game-area {
    gap: 12px;
  }

  .top-row {
    flex-wrap: nowrap;
    max-width: 1400px;
  }

  .top-row .meta-card {
    width: 360px;
    max-width: 360px;
    max-height: 85vh;
  }

  .top-row .log {
    width: auto;
    flex: 1;
    min-width: 300px;
    max-height: 85vh;
  }

  .board-wrapper {
    max-width: 700px;
  }

  .log {
    padding: 10px;
  }

  .log-header {
    margin-bottom: 10px;
    padding-bottom: 10px;
  }

  .log-header h4 {
    font-size: 0.9rem;
  }

  .log-item {
    font-size: 0.8rem;
    padding: 6px 8px;
  }

  .meta-row {
    padding: 10px 0;
    font-size: 0.9rem;
  }

  .player-card {
    padding: 10px;
  }

  .player-symbol {
    font-size: 1.6rem;
  }

  .player-card.active .player-symbol {
    font-size: 1.8rem;
  }

  .player-name {
    font-size: 0.8rem;
  }

  .log-header h4 {
    font-size: 0.95rem;
  }

  .log-item {
    font-size: 0.85rem;
    padding: 6px 8px;
  }

  footer {
    font-size: 0.85rem;
    padding-top: 8px;
    margin-top: auto;
  }
}

/* 平板和小屏幕 */
@media (max-width: 1399px) {
  .app {
    padding: 10px;
    gap: 10px;
  }

  header {
    padding: 10px 0;
  }

  main {
    gap: 6px;
    padding: 0;
  }

  .controls {
    flex-shrink: 0;
  }

  .control-panel {
    padding: 8px;
    gap: 6px;
  }

  .control-row {
    gap: 6px;
    flex-wrap: wrap;
  }

  .input-group {
    gap: 6px;
  }

  .input-group input,
  .input-group select {
    padding: 7px 9px;
    font-size: 0.85rem;
  }

  .ai-toggle {
    padding: 7px 10px;
    font-size: 0.85rem;
  }

  .lobby-section {
    max-height: 180px;
  }

  .lobby-in-game {
    max-height: 50vh;
    min-width: 250px;
  }

  .game-area {
    gap: 10px;
  }

  .top-row {
    flex-direction: column;
    max-height: 50vh;
  }

  .board-wrapper {
    max-width: 600px;
  }

  .top-row .meta-card {
    width: 100%;
    max-width: 100%;
    max-height: 25vh;
  }

  .top-row .log {
    width: 100%;
    max-width: 100%;
    max-height: 25vh;
  }

  .meta-row {
    padding: 8px 0;
  }

  .players-section {
    padding: 10px 0;
  }

  .player-card {
    padding: 8px;
  }

  .player-symbol {
    font-size: 1.4rem;
  }

  .player-name {
    font-size: 0.75rem;
  }
}

/* 移动端优化 */
@media (max-width: 768px) {
  .app {
    padding: 8px;
    gap: 6px;
  }

  header h1 {
    font-size: 1.4rem;
  }

  main {
    gap: 4px;
  }

  .controls {
    flex-shrink: 0;
  }

  .control-panel {
    padding: 8px;
    gap: 6px;
  }

  .control-row {
    gap: 6px;
    flex-wrap: wrap;
  }

  .control-row.buttons-row {
    gap: 4px;
  }

  .control-row.buttons-row button {
    flex: 1 1 auto;
    min-width: 60px;
    padding: 7px 8px;
    font-size: 0.8rem;
  }

  .input-group {
    gap: 6px;
    flex: 1 1 auto;
    min-width: 100%;
  }

  .input-group input,
  .input-group select {
    width: auto;
    flex: 1 1 auto;
    padding: 7px 8px;
    font-size: 0.85rem;
  }

  .ai-toggle {
    padding: 7px 8px;
    font-size: 0.8rem;
    flex: 0 1 auto;
  }

  .ai-icon {
    font-size: 0.9rem;
  }

  .status-group {
    gap: 8px;
    width: 100%;
    margin-top: 4px;
  }

  .status,
  .client-id {
    font-size: 0.75rem;
    flex: 1 1 auto;
  }

  .lobby-section {
    max-height: 140px;
  }

  .lobby-in-game {
    max-height: 35vh;
    min-width: 100%;
  }

  .game-area {
    gap: 8px;
  }

  .top-row {
    flex-direction: column;
    gap: 8px;
    max-height: none;
    flex-wrap: nowrap;
  }

  .board-wrapper {
    max-width: 100%;
  }

  .top-row .lobby-in-game {
    order: 1;
  }

  .top-row .meta-card {
    width: 100%;
    max-width: 100%;
    max-height: none;
    padding: 10px;
    gap: 8px;
    order: 2;
  }

  .top-row .log {
    width: 100%;
    max-width: 100%;
    max-height: 300px;
    padding: 10px;
    order: 3;
  }

  .meta-card {
    padding: 10px;
  }

  .meta-row {
    padding: 6px 0;
    gap: 8px;
    font-size: 0.9rem;
  }

  .room-badge {
    padding: 8px;
    gap: 6px;
  }

  .room-badge .value {
    font-size: 0.85rem;
  }

  .copy-btn {
    padding: 6px 10px;
    font-size: 0.8rem;
  }

  .players-section {
    padding: 8px 0;
    gap: 6px;
  }

  .player-card {
    padding: 8px;
    gap: 4px;
  }

  .player-symbol {
    font-size: 1.2rem;
  }

  .player-card.active .player-symbol {
    font-size: 1.4rem;
  }

  .player-name {
    font-size: 0.75rem;
  }

  .status-section {
    gap: 8px;
  }

  .status-item {
    padding: 8px;
  }

  .turn-badge {
    width: 36px;
    height: 36px;
    font-size: 1.2rem;
  }

  .log-header {
    margin-bottom: 8px;
    padding-bottom: 8px;
  }

  .log-header h4 {
    font-size: 0.9rem;
  }

  .log-header small {
    font-size: 0.8rem;
  }

  .log-item {
    font-size: 0.8rem;
    padding: 5px 8px;
  }

  footer {
    font-size: 0.8rem;
    padding: 8px 0;
    margin-top: auto;
  }

  .winner-card {
    padding: 24px;
  }

  .winner-symbol {
    font-size: 60px;
  }

  .helper-text {
    font-size: 0.85rem;
    padding: 8px;
    margin: 4px 0;
  }

  .error {
    font-size: 0.9rem;
    padding: 8px 10px;
  }
}

/* 小手机屏幕 */
@media (max-width: 480px) {
  .app {
    padding: 6px;
  }

  header h1 {
    font-size: 1.2rem;
  }

  .controls {
    padding: 6px;
    gap: 4px;
  }

  .controls input,
  .controls select,
  .controls button {
    padding: 7px 8px;
    font-size: 0.85rem;
  }

  .top-row .meta-card {
    max-height: 20vh;
    padding: 8px;
  }

  .top-row .log {
    max-height: 20vh;
    padding: 8px;
  }

  .meta-row {
    padding: 4px 0;
    font-size: 0.85rem;
  }

  .room-badge {
    padding: 6px 8px;
  }

  .room-badge .label {
    font-size: 0.75rem;
  }

  .room-badge .value {
    font-size: 0.8rem;
  }

  .copy-btn {
    padding: 5px 8px;
    font-size: 0.75rem;
  }

  .player-badge {
    min-width: 80px;
    padding: 6px 8px;
  }

  .player-card {
    padding: 6px;
  }

  .player-symbol {
    font-size: 1rem;
  }

  .status-item {
    padding: 6px;
  }

  .turn-badge {
    width: 32px;
    height: 32px;
    font-size: 1rem;
  }

  .log-item {
    font-size: 0.75rem;
    padding: 4px 6px;
  }
}
</style>