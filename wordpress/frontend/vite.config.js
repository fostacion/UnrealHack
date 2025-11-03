import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const NGROK_HOST = process.env.NGROK_HOST || undefined

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: [
      '.ngrok-free.app',
      'localhost',
      '127.0.0.1',
      ...(NGROK_HOST ? [NGROK_HOST] : []),
    ],

    hmr: NGROK_HOST ? {
      host: NGROK_HOST,
      protocol: 'wss',
      clientPort: 443,
    } : undefined,

    proxy: {
      '^/(popular|search|plugins|scan|translate|health)': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})