/** biome-ignore-all lint/suspicious/noExplicitAny: allowing any type for flexibility */
import { createServerFn } from '@tanstack/react-start'
import { err, ok, type Result, ResultAsync } from 'neverthrow'
import { prisma } from '@/lib/prisma-client'
import { authMiddleware } from '../better-auth/auth-middleware'
import { PLATFORM_MODELS, type PlatformModelName } from './core-api'
import { type DBPayload, executeOperation } from './crud-api'

// ---------------------------------------------------------------------------
// coreTransactionAPI
//
// Runs a batch of DBPayload operations atomically inside a single
// rootPrisma.$transaction — the platform-level equivalent of transactionAPI.
//
// All operations must target platform-level models (PLATFORM_MODELS whitelist).
// Requires an authenticated ADMIN session — batch platform mutations are always
// privileged operations (seeding plans, updating entitlements, etc.).
// ---------------------------------------------------------------------------

interface CoreTransactionInput {
  operations: DBPayload[]
}

const coreTransactionServerFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: CoreTransactionInput) => d)
  .handler(async ({ context, data }): Promise<{ value: any[] } | { error: any }> => {
    // Auth guard
    if (!context?.user?.id) {
      return { error: 'Authentication required for platform transactions.' }
    }

    // Role guard — ADMIN only
    if (context.user.role !== 'ADMIN') {
      return { error: `Platform transactions require ADMIN role. Current role: ${context.user.role}` }
    }

    // Non-empty batch
    if (!data.operations || data.operations.length === 0) {
      return { error: 'coreTransactionAPI: batch must contain at least one operation.' }
    }

    // Validate all operations target platform models
    for (const op of data.operations) {
      if (!PLATFORM_MODELS.includes(op.table as PlatformModelName)) {
        return {
          error: `coreTransactionAPI: "${op.table}" is not a platform-level model. Use transactionAPI for tenant data.`,
        }
      }
    }

    const txResult = await ResultAsync.fromPromise(
      prisma.$transaction(async tx => {
        const results = []
        for (const op of data.operations) {
          const out = await executeOperation(tx, op)
          results.push(out)
        }
        return results
      }),
      (e: any) => e.message || 'Core transaction batch failed',
    )

    return txResult.isOk() ? { value: txResult.value } : { error: txResult.error }
  })

// ---------------------------------------------------------------------------
// Exported public API
// ---------------------------------------------------------------------------

export const coreTransactionAPI = {
  execute: async (operations: DBPayload[]): Promise<Result<any[], string>> => {
    const response = await coreTransactionServerFn({ data: { operations } })

    if ('error' in response) {
      return err(response.error as string)
    }

    return ok(response.value)
  },
}
