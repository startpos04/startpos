// nitro.config.ts — Production server configuration for Vercel
import { defineNitroConfig } from 'nitro/config'

// Cross-origin isolation headers required for OPFS (SQLite WASM)
const crossOriginHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'cross-origin',
}

const securityHeaders = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  ...crossOriginHeaders,
}

export default defineNitroConfig({
  routeRules: {
    '/**': {
      headers: securityHeaders,
    },
    // Stripe pages need COEP removed (iframe loading)
    '/business/subscription/checkout/**': {
      headers: {
        ...securityHeaders,
        'Cross-Origin-Embedder-Policy': 'unsafe-none',
      },
    },
    '/business/subscription/credits/**': {
      headers: {
        ...securityHeaders,
        'Cross-Origin-Embedder-Policy': 'unsafe-none',
      },
    },
    '/billing/**': {
      headers: {
        ...securityHeaders,
        'Cross-Origin-Embedder-Policy': 'unsafe-none',
      },
    },
  },
})
