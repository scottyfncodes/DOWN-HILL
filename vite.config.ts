import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
  test: { include: ['tests/**/*.test.ts'] },
} as any)
