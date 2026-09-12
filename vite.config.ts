import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Port 1420 with strictPort is the Tauri convention: Tauri's `build.devUrl`
// points at a fixed port, so the dev server must never silently pick another one.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
})
