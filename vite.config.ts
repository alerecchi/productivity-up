import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import checker from 'vite-plugin-checker'
import viteTsConfigPaths from 'vite-tsconfig-paths'

const config = defineConfig(({ isSsrBuild }) => ({
  build: {
    rollupOptions: isSsrBuild ? {} : { output: { manualChunks } },
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
    checker({
      typescript: true,
    }),
  ],
}))

function manualChunks(id: string) {
  if (!id.includes('node_modules')) {
    return
  }

  const packageName = getPackageName(id)

  if (!packageName) {
    return 'vendor'
  }

  if (packageName.startsWith('@tanstack/')) {
    return 'tanstack'
  }

  if (packageName.startsWith('@base-ui/') || packageName === 'lucide-react') {
    return 'ui'
  }

  if (packageName.startsWith('@dnd-kit/')) {
    return 'dnd'
  }

  if (packageName === 'react' || packageName === 'react-dom' || packageName === 'scheduler') {
    return 'react'
  }

  return 'vendor'
}

function getPackageName(id: string) {
  const modulePathIndex = id.lastIndexOf('node_modules/')

  if (modulePathIndex === -1) {
    return
  }

  const modulePath = id.slice(modulePathIndex + 'node_modules/'.length)

  if (!modulePath) {
    return
  }

  const parts = modulePath.split('/')

  if (parts[0]?.startsWith('@')) {
    return `${parts[0]}/${parts[1]}`
  }

  return parts[0]
}

export default config
