/**
 * accept-terms.ts
 *
 * Server function that records a fresh ToS/Privacy Policy acceptance
 * when a returning merchant is shown the re-acceptance modal after a
 * material change to the legal documents.
 *
 * Called from TermsUpdateModal in (private)/route.tsx.
 * Uses rootPrisma (User is a platform-level record, not tenant-scoped).
 */

import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '../better-auth/auth-middleware'
import { prisma as rootPrisma } from '../prisma-client'
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '../queries/complete-registration'

export const acceptTerms = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const userId = context.user.id
    const now = new Date()

    await rootPrisma.user.update({
      where: { id: userId },
      data: {
        termsAcceptedAt: now,
        termsVersion: CURRENT_TERMS_VERSION,
        privacyAcceptedAt: now,
        privacyVersion: CURRENT_PRIVACY_VERSION,
      },
    })

    return { ok: true }
  })
