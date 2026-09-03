import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import { tanstackSerwistPlugin } from './vite-plugin'

const port = Number(process.env['PORT'] ?? 3001)
const publicPort = Number(process.env['PUBLIC_PORT'] ?? port)
const dockerDev = process.env['DOCKER_DEV'] === 'true'

const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'cross-origin',
}

const securityHeaders = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy-Report-Only': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "connect-src 'self'",
    "img-src 'self' data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; '),
  ...crossOriginIsolationHeaders,
}

function crossOriginHeadersPlugin(): Plugin {
  return {
    name: 'force-security-headers',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        for (const [key, value] of Object.entries(securityHeaders)) {
          res.setHeader(key, value)
        }
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        for (const [key, value] of Object.entries(securityHeaders)) {
          res.setHeader(key, value)
        }
        next()
      })
    },
  }
}

const serverConfig = {
  port,
  strictPort: true,
  host: true,
  watch: { usePolling: dockerDev },
  headers: securityHeaders,
  ...(dockerDev ? { hmr: { host: 'localhost', clientPort: publicPort } } : {}),
}

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@platform\/(.*)/,
        replacement: resolve(__dirname, '../../packages/platform') + '/$1',
      },
      {
        find: /^@\/(.*)/,
        replacement: resolve(__dirname, 'src') + '/$1',
      },
      {
        find: /^prisma\/(.*)/,
        replacement: resolve(__dirname, '../web/prisma') + '/$1',
      },
    ],
  },
  plugins: [
    crossOriginHeadersPlugin(),
    viteTsConfigPaths({ projects: ['./tsconfig.json'] }),
    tanstackStart(),
    nitro({ routeRules: { '/**': { headers: securityHeaders } } }),
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
    headers: securityHeaders,
  },
  optimizeDeps: {
    exclude: ['@tanstack/browser-db-sqlite-persistence'],
  },
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: !!process.env['CONSOLE_LOG'],
        drop_debugger: true,
      },
    },
  },
})
