import { createFileRoute } from '@tanstack/react-router'
import { auth } from '@/lib/better-auth/auth'

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
