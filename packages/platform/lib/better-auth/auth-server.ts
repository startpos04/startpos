import { createServerFn } from '@tanstack/react-start'
import { getTenantPrisma } from '../prisma-client'
import { auth } from './auth'
import { authMiddleware } from './auth-middleware'

// ---------------------------------------------------------------------------
// getSessionUser — Foundation session reader
//
// Returns the minimal user + tenant context extracted from the active session.
// No business logic, no entitlements, no billing, no compliance.
//
// Apps extend this by calling getSessionUser() then layering on their own
// domain context (see apps/web/src/lib/better-auth/auth-server.ts).
// ---------------------------------------------------------------------------
export const getSessionUser = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!context?.user?.businessId || !context?.user?.branchId) {
      return undefined
    }

    const { id, email, role, businessId, branchId, authorization } = context.user

    return {
      id,
      email,
      role,
      businessId,
      branchId,
      authorization,
    }
  })

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>

// ---------------------------------------------------------------------------
// verifyAuth — Generic password re-verification
//
// Used for supervisor re-auth flows (POS feature gating, sensitive actions).
// Does NOT update the active session — asResponse: true is intentional.
// ---------------------------------------------------------------------------
export const verifyAuth = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: { email: string; password: string }) => data)
  .handler(async ({ data, context }) => {
    if (!context?.user?.businessId || !context?.user?.branchId) {
      return { success: false, error: 'Context missing' }
    }

    const { businessId, branchId } = context.user
    const prisma = getTenantPrisma(businessId, branchId)

    try {
      const response = await auth.api.signInEmail({
        body: {
          email: data.email,
          password: data.password,
        },
        asResponse: true, // Crucial: prevents updating active session headers/cookies
      })

      if (!response.ok) {
        return { success: false, error: 'Invalid password.' }
      }

      const user = await prisma.user.findFirst({
        where: { email: data.email },
        select: { id: true, name: true, role: true },
      })

      if (!user) {
        return { success: false, error: 'User is not authorized.' }
      }

      return {
        success: true,
        data: {
          id: user.id,
          name: user.name,
          role: user.role,
        },
      }
    } catch (error) {
      console.error('verification error:', error)
      return { success: false, error: 'Internal verification failure.' }
    }
  })
