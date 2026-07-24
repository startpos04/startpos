import { createAuthClient } from 'better-auth/react'

const baseURL = typeof window === 'undefined' ? (process.env['BETTER_AUTH_INTERNAL_URL'] ?? process.env['BETTER_AUTH_URL']) : process.env['BETTER_AUTH_URL']

export const authClient = createAuthClient({
  baseURL,
})
