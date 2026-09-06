// TODO: Replace with adminAuth once the AdminUser table and separate betterAuth
// instance are implemented. Tracked as: admin auth wiring task (deferred).
// Temporarily re-uses the tenant betterAuth instance via platform's prisma client.
// This means admin login goes through the tenant users table until the admin
// portal has its own auth instance.

import { prisma } from '@platform/lib/prisma-client'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

// Minimal auth instance for the admin API route — email/password only,
// no Membership hook, no social providers. Admins are just users for now.
const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  baseURL: process.env['BETTER_AUTH_URL'],
  secret: process.env['BETTER_AUTH_SECRET'],
  emailAndPassword: { enabled: true },
  plugins: [tanstackStartCookies()],
})

import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await auth.handler(request)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const stack = error instanceof Error ? error.stack : undefined
          console.error('[/api/auth] GET error:', error)
          return new Response(JSON.stringify({ error: message, stack: process.env['NODE_ENV'] !== 'production' ? stack : undefined }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
      POST: async ({ request }) => {
        try {
          return await auth.handler(request)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const stack = error instanceof Error ? error.stack : undefined
          console.error('[/api/auth] POST error:', error)
          return new Response(JSON.stringify({ error: message, stack: process.env['NODE_ENV'] !== 'production' ? stack : undefined }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
