/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // For GitHub Pages project sites the app lives under /<repo>/. Set VITE_BASE
  // at build time (e.g. VITE_BASE=/avignon-planner/). Dev stays at '/'.
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
  },
})
