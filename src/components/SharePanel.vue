<template>
  <div class="share-panel">
    <div class="share-controls">
      <input readonly :value="shareUrl" class="share-input" />
      <button class="btn" @click="copyLink" :disabled="!shareUrl">复制链接</button>
      <button class="btn" @click="toggleQr" :disabled="!shareUrl">{{ showQr ? '隐藏二维码' : '显示二维码' }}</button>
    </div>

    <div class="copied" v-if="copied">已复制到剪贴板 ✅</div>

    <div class="qr" v-if="showQr && qrDataUrl">
      <img :src="qrDataUrl" alt="二维码" />
    </div>
  </div>
</template>

<script>
import QRCode from 'qrcode'
export default {
  name: 'SharePanel',
  props: ['roomId'],
  data() {
    return { shareUrl: '', qrDataUrl: '', showQr: false, copied: false }
  },
  watch: {
    roomId: { immediate: true, handler() { this.update(); } }
  },
  methods: {
    update() {
      if (!this.roomId) { this.shareUrl = ''; this.qrDataUrl = ''; return }
      const url = `${location.origin}${location.pathname}?room=${encodeURIComponent(this.roomId)}`
      this.shareUrl = url
      QRCode.toDataURL(url, { margin: 1, width: 240 }).then(d => this.qrDataUrl = d).catch(() => this.qrDataUrl = '')
    },
    copyLink() {
      if (!this.shareUrl) return
      navigator.clipboard.writeText(this.shareUrl).then(() => {
        this.copied = true
        setTimeout(() => (this.copied = false), 1500)
      })
    },
    toggleQr() { this.showQr = !this.showQr }
  }
}
</script>

<style scoped>
.share-panel { display:flex; flex-direction:column; gap:8px; align-items:flex-start }
.share-controls { display:flex; gap:8px; align-items:center }
.share-input { min-width:260px; padding:6px 8px; border-radius:6px; border:1px solid #e6eef6; background:#fff }
.btn { padding:6px 10px; border-radius:6px; border:1px solid #dfeaf6; background:#fbfdff; cursor:pointer }
.copied { color: #2a8a2a; font-size:0.9rem }
.qr img { width:240px; height:240px; border-radius:6px; box-shadow:0 6px 18px rgba(12,22,48,0.06) }
</style>
