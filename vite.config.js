// Delegate to ESM config so ESM-only plugins (like @vitejs/plugin-vue) can be loaded
module.exports = () => import('./vite.config.mjs').then(m => m.default || m)
