import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    open: false,
    fs: {
      // Allow serving files from one level up to the project root
      allow: ['..'],
    },
    watch: {
      // Watch for changes in ciam-ui source files
      ignored: ['!**/node_modules/**', '!../ciam-ui/**'],
    },
  },
  preview: {
    port: 3001,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  optimizeDeps: {
    exclude: ['ciam-ui'],
    force: true,
  },
})