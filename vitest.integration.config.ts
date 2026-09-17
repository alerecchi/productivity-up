import viteTsConfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
  ],
  test: {
    clearMocks: true,
    environment: 'node',
    fileParallelism: false,
    include: ['**/*.integration.test.ts'],
    maxWorkers: 1,
    passWithNoTests: false,
    restoreMocks: true,
  },
})
