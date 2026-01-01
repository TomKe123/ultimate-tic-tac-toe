<template>
  <div class="ultimate">
    <div class="board-grid">
      <small-board
        v-for="(b, i) in boards"
        :key="i"
        :index="i"
        :cells="b.cells"
        :owner="b.owner"
        :nextAllowedBoard="state.nextAllowedBoard"
        :active="isBoardActive(i)"
        :currentPlayer="state.currentPlayer"
        :meSymbol="meSymbol"
        @cell-click="onCellClick"
      />
    </div>
  </div>
</template>

<script>
import SmallBoard from './SmallBoard.vue'
export default {
  name: 'UltimateBoard',
  components: { SmallBoard },
  props: ['state', 'meSymbol', 'clientId'],
  computed: {
    boards() { return this.state ? this.state.boards : [] }
  },
  methods: {
    isBoardActive(i) {
      if (!this.state) return false
      if (this.state.winner) return false
      if (this.state.nextAllowedBoard === -1) return true
      return this.state.nextAllowedBoard === i
    },
    onCellClick({ boardIndex, cellIndex }) {
      this.$emit('move', { boardIndex, cellIndex })
    }
  }
}
</script>

<style scoped>
.board-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap: 12px; width: min(640px, 90vw); margin: 0 auto }
.ultimate { display:flex; justify-content:center; width:100% }
</style>