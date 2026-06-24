import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/ph1/',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5175,
    host: '127.0.0.1'
  }
})
