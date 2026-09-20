import { fileURLToPath } from 'node:url'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

process.env.VITE_APP_NAME ??= 'Productivity Up'
process.env.VITE_SERVER_URL ??= 'http://localhost:3000'

export default defineConfig({
  plugins: [viteTsConfigPaths({ projects: ['./tsconfig.json'] }), tanstackStart()],
  resolve: {
    alias: {
      'cloudflare:workers': fileURLToPath(new URL('./src/test/cloudflare-workers.ts', import.meta.url)),
    },
  },
  ssr: {
    noExternal: ['@tanstack/start-server-core', '@tanstack/react-start', '@tanstack/react-start-server'],
  },
  test: {
    environment: 'node',
    include: ['src/server/core/public-request.integration.ts'],
  },
})
