/**
 * check-email-available.ts
 *
 * Server function that checks whether an email address is available for
 * registration. Returns { available: true } if no account exists with that
 * email, or { available: false } if the email is already taken.
 *
 * Uses rootPrisma to query the User table directly â€” no auth session required
 * since this is called before the user is logged in.
 *
 * Architecture note:
 *   This is a GET server function with no authMiddleware â€” it is intentionally
 *   public. It returns a boolean only â€” never leaks any user data.
 *   Rate-limiting is handled at the infrastructure level (not here).
 */

import { prisma as rootPrisma } from '@platform/lib/prisma-client'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

const schema = z.object({ email: z.string().email() })

export const checkEmailAvailable = createServerFn({ method: 'GET' })
  .inputValidator((d: { email: string }) => schema.parse(d))
  .handler(async ({ data }): Promise<{ available: boolean }> => {
    const existing = await rootPrisma.user.findFirst({
      where: { email: data.email.toLowerCase().trim() },
      select: { id: true },
    })
    return { available: existing === null }
  })
