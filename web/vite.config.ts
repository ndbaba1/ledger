/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // Absolute asset paths: with BrowserRouter, the SPA fallback serves this
  // same index.html on nested paths (e.g. /u/handle/slug), where relative
  // paths would resolve against the wrong directory.
  base: '/',
  // The single-file preview build (VITE_ROUTER=memory) must be one script, so it skips code splitting.
  build: process.env.VITE_ROUTER === 'memory' ? { rolldownOptions: { output: { inlineDynamicImports: true } } } : {},
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
