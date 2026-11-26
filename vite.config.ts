import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { prototypePages } from './scripts/vite-prototype-pages.mjs'

export default defineConfig(({ mode }) => ({
  // prototypePages(): dev server and preview only (no effect on the build), so /app/'s Email and Survey frames work under `npm run dev`.
  plugins: [react(), prototypePages()],
  base: mode === 'github-pages' ? '/bmc-ticket-report-generator/' : '/',
  build: {
    rollupOptions: {
      // Two pages: the live WhatsApp report (index.html, unchanged) and the
      // unified app (app/index.html), published at /app/. Paths are relative
      // to the project root.
      input: {
        main: 'index.html',
        app: 'app/index.html',
      },
    },
  },
  test: { exclude: ['prototype/**', ...configDefaults.exclude] },
}))
