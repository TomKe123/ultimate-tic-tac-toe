import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // Allow LAN/external access for dev/preview so other devices can reach the Vite server
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 }
})
