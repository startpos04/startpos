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

// ---------------------------------------------------------------------------
// Cross-Origin Isolation — required for SharedArrayBuffer (SQLite WASM).
// Present in dev, preview, and production.
// ---------------------------------------------------------------------------
const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'cross-origin',
}

// ---------------------------------------------------------------------------
// Security headers — Phase 2 Legal Compliance
//
// Applied to all routes via Nitro routeRules so they are present in both
// the dev server (via vite.server.headers) and production (via Nitro).
//
// CSP strategy:
//   - report-only in this phase so violations surface in the console without
//     breaking anything. Tighten to enforcing after observing reports for
//     one release cycle.
//   - 'unsafe-inline' for scripts is required by TanStack Start SSR hydration
//     (inline <script> tags). Remove it only after adopting nonces.
//   - connect-src includes Resend, Stripe, and Google/Facebook OAuth origins.
//
// To graduate CSP from report-only to enforcing:
//   1. Remove -Report-Only suffix from the header name.
//   2. Change 'report-uri' to a real endpoint if you want violation logging.
// ---------------------------------------------------------------------------
const securityHeaders = {
  // Prevent this app from being embedded in iframes (clickjacking protection)
  'X-Frame-Options': 'DENY',
  // Prevent MIME-type sniffing
  'X-Content-Type-Options': 'nosniff',
  // Only send origin in Referer, not full URL
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Force HTTPS for 1 year (only meaningful in production — harmless in dev)
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  // CSP in report-only mode — violations logged to console, nothing blocked
  'Content-Security-Policy-Report-Only': [
    "default-src 'self'",
    // TanStack Start SSR hydration requires unsafe-inline for inline <script> tags
    "script-src 'self' 'unsafe-inline' https://js.stripe.com https://accounts.google.com",
    "style-src 'self' 'unsafe-inline'",
    // Fonts loaded from self (Inter variable font bundled locally)
    "font-src 'self'",
    // API calls: self + Stripe + Resend (no direct browser calls) + Google/FB OAuth
    "connect-src 'self' https://api.stripe.com https://accounts.google.com https://graph.facebook.com",
    // Stripe.js hosted checkout iframe
    'frame-src https://js.stripe.com https://hooks.stripe.com',
    // Images: self + data URIs (avatars) + Google profile pictures
    "img-src 'self' data: https://lh3.googleusercontent.com https://graph.facebook.com",
    // Worker for SQLite WASM
    "worker-src 'self' blob:",
    // Prevent loading anything in <object>/<embed>
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; '),
  ...crossOriginIsolationHeaders,
}

const serverConfig = {
  port,
  strictPort: true,
  host: true,
  watch: {
    usePolling: dockerDev,
  },
  headers: securityHeaders,
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
    // Pass security headers to Nitro so they are present in production builds.
    // routeRules '/**' applies to every route including API routes and pages.
    nitro({
      routeRules: {
        '/**': {
          headers: securityHeaders,
        },
      },
    }),
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
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
})

export default config
