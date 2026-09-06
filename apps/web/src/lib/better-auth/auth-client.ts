import { emailOTPClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

// Server-side uses the internal URL to avoid the public internet round-trip.
// Client-side uses the public URL resolved at build time via Vite env.
const baseURL = typeof window === 'undefined' ? (process.env['BETTER_AUTH_INTERNAL_URL'] ?? process.env['BETTER_AUTH_URL']) : process.env['BETTER_AUTH_URL']

export const authClient = createAuthClient({
  baseURL,
  plugins: [emailOTPClient()],
})
