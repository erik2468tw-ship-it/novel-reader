import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3002,
    proxy: {
      '/api': {
        target: 'http://100.64.100.6:3002',
        changeOrigin: true
      }
    }
  }
})
