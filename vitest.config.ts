import { fileURLToPath } from 'node:url'

import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    viteReact({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
  ],
  resolve: {
    alias: {
      'cloudflare:workers': fileURLToPath(new URL('./src/test/cloudflare-workers.ts', import.meta.url)),
    },
  },
  test: {
    clearMocks: true,
    coverage: {
      exclude: ['src/routeTree.gen.ts', 'src/routes/api/**', 'src/features/shared/components/ui/**'],
      provider: 'v8',
      reporter: ['text', 'html'],
    },
    environment: 'jsdom',
    exclude: ['**/node_modules/**', '**/dist/**', '**/.{idea,git,cache,output,temp}/**', '**/src/routeTree.gen.ts'],
    passWithNoTests: false,
    restoreMocks: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
