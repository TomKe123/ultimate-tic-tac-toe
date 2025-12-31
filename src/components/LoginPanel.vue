<template>
  <div class="login-panel">
    <h3>登录</h3>
    <div class="input-group">
      <input v-model="nick" placeholder="输入昵称（2-20 字）" @keyup.enter="submit" />
      <button class="btn primary" @click="submit">登录</button>
    </div>
    <div class="hint">昵称需唯一；断开后昵称会被释放。</div>
    <div class="error" v-if="error">{{ error }}</div>
  </div>
</template>

<script>
export default {
  name: 'LoginPanel',
  props: ['error'],
  data() { return { nick: '' } },
  methods: {
    submit() {
      const n = (this.nick || '').trim()
      if (!n) return
      this.$emit('login', n)
    }
  }
}
</script>

<style scoped>
.login-panel{
  background:#fff;padding:16px;border-radius:var(--radius-lg);box-shadow:var(--shadow-md);
  display:flex;flex-direction:column;gap:12px;border:1px solid #e2e8f0;max-width:320px;margin:0 auto
}
.login-panel h3{margin:0 0 8px;color:#1e293b;font-size:1.1rem}
.input-group{display:flex;gap:10px;align-items:center}
.input-group input{flex:1;padding:9px 12px;border-radius:var(--radius-md);border:1px solid #cbd5e1;background:#fff;color:#1e293b;transition:all 0.2s;font-size:0.95rem}
.input-group input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(37,99,235,0.1)}
.input-group input::placeholder{color:#94a3b8}
.btn{padding:9px 14px;border-radius:var(--radius-md);border:1px solid #cbd5e1;background:#fff;color:#1e293b;cursor:pointer;font-weight:500;transition:all 0.2s}
.btn:hover{border-color:var(--accent);background:#f0f4f8}
.btn.primary{background:linear-gradient(135deg,var(--accent) 0%,#1d4ed8 100%);color:#fff;border-color:transparent;box-shadow:0 4px 12px rgba(37,99,235,0.3)}
.btn.primary:hover{box-shadow:0 6px 20px rgba(37,99,235,0.4)}
.error{color:#dc2626;padding:10px 12px;background:#fee2e2;border-radius:var(--radius-md);font-size:0.9rem;border-left:3px solid #dc2626}
.hint{color:var(--muted);font-size:0.9rem;padding:8px 0;border-top:1px solid #e2e8f0;padding-top:8px}
@media (max-width:600px){
  .login-panel{max-width:100%}
  .input-group{flex-direction:column;align-items:stretch}
  .input-group input,.input-group button{width:100%}
}
</style>