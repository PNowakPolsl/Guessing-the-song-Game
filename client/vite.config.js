import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Backend (server.js) nasluchuje na porcie 3000 - w trybie dev
      // przekazujemy do niego zadania Socket.IO i Spotify OAuth.
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
      '/auth': {
        target: 'http://localhost:3000',
      },
    },
  },
})
