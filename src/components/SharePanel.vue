<template>
  <div class="share-panel">
    <div class="share-header">
      <h4>分享房间</h4>
    </div>
    <div class="share-controls">
      <input readonly :value="shareUrl" class="share-input" title="房间分享链接" />
      <button class="btn btn-icon" @click="copyLink" :disabled="!shareUrl" title="复制链接">📋</button>
      <button class="btn btn-icon" @click="toggleQr" :disabled="!shareUrl" title="切换二维码">{{ showQr ? '✕' : 'QR' }}</button>
    </div>

    <div class="copied" v-if="copied">✅ 已复制到剪贴板</div>

    <div class="qr" v-if="showQr && qrDataUrl">
      <img :src="qrDataUrl" alt="房间二维码" />
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
.share-panel{display:flex;flex-direction:column;gap:12px;padding:12px;background:linear-gradient(135deg,#f0f4f8 0%,#f9fafb 100%);border-radius:var(--radius-lg);border:1px solid #e2e8f0}
.share-header{margin:0}
.share-header h4{margin:0;color:#1e293b;font-size:0.95rem;font-weight:600}
.share-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.share-input{
  flex:1;min-width:200px;padding:9px 12px;border-radius:var(--radius-md);border:1px solid #cbd5e1;
  background:#fff;color:#475569;font-size:0.9rem;font-family:monospace;
  transition:all 0.2s;cursor:text
}
.share-input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(37,99,235,0.1)}
.btn{padding:8px 12px;border-radius:var(--radius-md);border:1px solid #cbd5e1;background:#fff;color:#1e293b;cursor:pointer;font-weight:500;transition:all 0.2s;font-size:0.9rem}
.btn:hover:not(:disabled){border-color:var(--accent);background:linear-gradient(135deg,#fff,#f0f4f8);box-shadow:var(--shadow-sm)}
.btn-icon{padding:8px 10px;font-size:1rem;min-width:auto}
.btn:disabled{opacity:0.5;cursor:not-allowed}
.copied{color:var(--success);font-size:0.9rem;font-weight:600;padding:8px 12px;background:#ecfdf5;border-radius:var(--radius-md);border-left:3px solid var(--success)}
.qr{display:flex;justify-content:center;padding:12px;background:#fff;border-radius:var(--radius-md);border:1px solid #e2e8f0}
.qr img{width:200px;height:200px;border-radius:var(--radius-md);box-shadow:var(--shadow-sm)}
@media (max-width:600px){
  .share-panel{padding:10px}
  .share-input{min-width:150px;font-size:0.85rem;padding:8px 10px}
  .qr img{width:160px;height:160px}
}
</style>
