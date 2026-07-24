import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import { tanstackSerwistPlugin } from './vite-plugin'

const port = Number(process.env['PORT'] ?? 3000)
const publicPort = Number(process.env['PUBLIC_PORT'] ?? port)
const dockerDev = process.env['DOCKER_DEV'] === 'true'

const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'cross-origin',
}

const serverConfig = {
  port,
  strictPort: true,
  host: true,
  watch: {
    usePolling: dockerDev,
  },
  headers: crossOriginIsolationHeaders,
  ...(dockerDev
    ? {
        hmr: {
          host: 'localhost',
          clientPort: publicPort,
        },
      }
    : {}),
}

const config = defineConfig({
  plugins: [
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackStart(),
    nitro(),
    ...(dockerDev ? [] : [devtools()]),
    tailwindcss(),
    viteReact(),
    tanstackSerwistPlugin(),
  ],
  server: serverConfig,
  preview: {
    host: true,
    port,
    strictPort: true,
    headers: crossOriginIsolationHeaders,
  },
  optimizeDeps: {
    exclude: ['@tanstack/browser-db-sqlite-persistence'],
  },
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
})

export default config
