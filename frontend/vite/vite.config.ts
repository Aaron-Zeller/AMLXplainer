import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: ['quantumquokka.xaiml26.ivia.isginf.ch', '.quantumquokka.xaiml26.ivia.isginf.ch'],
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
})
