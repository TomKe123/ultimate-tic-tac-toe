<template>
  <div class="lobby-panel">
    <div class="header">
      <h3>大厅</h3>
      <button class="btn" @click="$emit('refresh')">刷新</button>
    </div>
    <div v-if="rooms && rooms.length">
      <table class="rooms">
        <thead><tr><th>房间</th><th>玩家 (X / O)</th><th>观战</th><th>状态</th><th></th></tr></thead>
        <tbody>
          <tr v-for="r in rooms" :key="r.roomId">
            <td><code>{{ r.roomId }}</code></td>
            <td>{{ r.players.X || '-' }} / {{ r.players.O || '-' }}</td>
            <td>{{ r.spectatorCount }}</td>
            <td>{{ r.hasVacancy ? '可加入' : '满' }}</td>
            <td style="display:flex;gap:8px">
              <button class="btn" @click="$emit('spectate', r.roomId)">观战</button>
              <button class="btn" @click="$emit('join', r.roomId)" :disabled="!r.hasVacancy">加入</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="empty">暂无房间，创建一个吧</div>
  </div>
</template>

<script>
export default {
  name: 'LobbyPanel',
  props: ['rooms']
}
</script>

<style scoped>
.lobby-panel{background:#fff;padding:8px;border-radius:8px;box-shadow:0 6px 18px rgba(12,22,48,0.06)}
.header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.rooms{width:100%;border-collapse:collapse}
.rooms th,.rooms td{padding:6px 8px;border-bottom:1px solid #eef5fb}
.btn{padding:6px 8px;border-radius:6px;border:1px solid #dfeaf6;background:#fbfdff;cursor:pointer}
.empty{color:#666;padding:8px}
</style>