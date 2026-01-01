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
.small-board{
  position:relative;background:#fff;border:2px solid #e2e8f0;padding:10px;min-width:160px;aspect-ratio:1/1;
  display:flex;flex-direction:column;transition:all 0.2s cubic-bezier(0.4,0,0.2,1);
  border-radius:var(--radius-md);box-shadow:var(--shadow-sm)
}
.small-board:hover:not(.owned){transform:translateY(-2px);box-shadow:var(--shadow-md);border-color:#cbd5e1}
.small-board.active{border-color:var(--accent);box-shadow:0 0 16px rgba(37,99,235,0.15);background:linear-gradient(135deg,#f0f7ff 0%,#fff 100%)}
.small-board.owned{background:linear-gradient(135deg,#f5f5f5 0%,#fafafa 100%);opacity:0.85;cursor:default}
.owner{
  position:absolute;inset:8px;display:flex;align-items:center;justify-content:center;
  font-size:64px;font-weight:900;opacity:0.15;pointer-events:none;line-height:1
}
.owner.x{color:var(--x-color);opacity:0.2}
.owner.o{color:var(--o-color);opacity:0.2}
.cells{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%;height:100%}
.small-board.owned .cells{display:none}
.cell{
  background:#f8fafc;display:flex;align-items:center;justify-content:center;
  font-size:clamp(18px,4vw,32px);aspect-ratio:1/1;user-select:none;
  transition:all 0.15s cubic-bezier(0.4,0,0.2,1);border-radius:var(--radius-sm);
  border:1px solid #e2e8f0;font-weight:700;
}
.cell:hover{box-shadow:0 2px 8px rgba(15,23,42,0.1);transform:scale(1.05)}
.cells.inactive .cell{cursor:not-allowed;opacity:0.4;transform:none !important;box-shadow:none}
.cell.allowed{
  background:linear-gradient(135deg,rgba(37,99,235,0.08) 0%,rgba(6,182,212,0.04) 100%);
  border:1.5px solid rgba(37,99,235,0.3);cursor:pointer;box-shadow:0 2px 8px rgba(37,99,235,0.1)
}
.cell.allowed:hover{border-color:var(--accent);box-shadow:0 4px 12px rgba(37,99,235,0.2)}
.cell.x{color:var(--x-color);text-shadow:0 2px 4px rgba(239,68,68,0.1)}
.cell.o{color:var(--o-color);text-shadow:0 2px 4px rgba(59,130,246,0.1)}
@media (max-width:600px){
  .small-board{min-width:120px;padding:8px}
  .cells{gap:6px}
  .cell{font-size:clamp(16px,3vw,24px)}
}
</style>