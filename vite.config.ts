/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build can be served from any sub-path.
  base: './',
  // The single-file preview build (VITE_ROUTER=memory) must be one script, so it skips code splitting.
  build: process.env.VITE_ROUTER === 'memory' ? { rolldownOptions: { output: { inlineDynamicImports: true } } } : {},
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
