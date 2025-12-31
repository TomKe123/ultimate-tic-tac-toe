<template>
  <div class="small-board" :class="{ owned: owner, active: active }">
    <div class="owner" v-if="owner" :class="owner === 'X' ? 'x' : 'o'">{{ owner }}</div>
    <div class="cells" :class="{ inactive: !active }">
      <div
        v-for="(c, idx) in cells"
        :key="idx"
        class="cell"
        :class="{ allowed: active && !owner && !cells[idx], x: c === 'X', o: c === 'O' }"
        :title="c ? ('已被 ' + c + ' 占用') : (active ? '点击落子' : '不可落子')"
        @click="onClick(idx)"
      >
        {{ c || (owner ? owner : '') }}
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'SmallBoard',
  props: ['index', 'cells', 'owner', 'nextAllowedBoard', 'active', 'currentPlayer', 'meSymbol'],
  methods: {
    onClick(idx) {
      if (!this.active) return
      if (this.owner) return
      if (this.cells[idx]) return
      this.$emit('cell-click', { boardIndex: this.index, cellIndex: idx })
    }
  }
}
</script>

<style scoped>
.small-board { position:relative; background:#fff; border:2px solid #e6eef6; padding:8px; min-width:200px; aspect-ratio:1/1; display:flex; flex-direction:column; transition: box-shadow .15s ease, border-color .15s ease, transform .08s }
.small-board:hover{transform:translateY(-2px)}
.small-board.active { border-color: var(--accent); box-shadow: 0 6px 18px rgba(43,108,176,0.06) }
.owner { position:absolute; inset:8px; display:flex; align-items:center; justify-content:center; font-size:64px; opacity:0.06; font-weight:800; color:var(--muted); pointer-events:none }
.cells { display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; width:100%; height:100% }
.cell { background:#f8fafc; display:flex; align-items:center; justify-content:center; font-size:clamp(18px,4vw,32px); aspect-ratio:1/1; cursor:pointer; user-select:none; transition: transform .08s ease, background .12s, box-shadow .12s; border-radius:6px }
.cell:hover{ transform:scale(1.02); box-shadow:0 6px 14px rgba(12,20,30,0.06) }
.cells.inactive .cell { cursor: not-allowed; opacity:0.4; transform:none; box-shadow:none }
.cell.allowed { background: linear-gradient(180deg, rgba(43,108,176,0.06), rgba(43,108,176,0.02)); border:1px solid rgba(43,108,176,0.12) }
.small-board.owned { background: linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.01)); }
.small-board.owned .cells { display:none }
.owner.x{ color: var(--x-color); opacity:0.95; font-size:140px }
.owner.o{ color: var(--o-color); opacity:0.95; font-size:140px }
.cell.x { color: var(--x-color); font-weight:800 }
.cell.o { color: var(--o-color); font-weight:800 }
@keyframes pop { from { transform: scale(.9); opacity:0 } to { transform: scale(1); opacity:1 } }
</style>