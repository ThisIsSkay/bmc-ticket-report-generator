import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'github-pages' ? '/bmc-ticket-report-generator/' : '/',
  test: { exclude: ['prototype/**', ...configDefaults.exclude] },
}))
