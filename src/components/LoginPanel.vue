<template>
  <div class="login-panel">
    <h3>登录</h3>
    <div style="display:flex;gap:8px;align-items:center">
      <input v-model="nick" placeholder="输入昵称（2-20 字）" />
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
.login-panel{background:#fff;padding:10px;border-radius:8px;box-shadow:0 6px 18px rgba(12,22,48,0.06);display:flex;flex-direction:column;gap:8px}
.btn{padding:6px 10px;border-radius:6px;border:1px solid #dfeaf6;background:#fbfdff;cursor:pointer}
.primary{background:linear-gradient(180deg,#2b6cb0,#214f86);color:#fff}
.error{color:#b91c1c}
.hint{color:#666;font-size:0.9rem}
</style>