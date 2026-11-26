import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
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
