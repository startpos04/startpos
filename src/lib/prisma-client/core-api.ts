/** biome-ignore-all lint/suspicious/noExplicitAny: allowing any type for flexibility */
import { createServerFn } from '@tanstack/react-start'
import { err, ok, type Result, ResultAsync } from 'neverthrow'
import type { Prisma } from 'prisma/generated/prisma/client'
import { prisma } from '@/lib/prisma-client'
import { authMiddleware } from '../better-auth/auth-middleware'
import { type DBPayload, executeOperation } from './crud-api'

// ---------------------------------------------------------------------------
// Platform-level model whitelist
//
// These models have no businessId/branchId fields — they are not tenant-scoped.
// coreAPI only operates on this set. Attempting to call any other model name
// is rejected at runtime by both server functions.
//
// Read operations are PUBLIC (no auth required) — safe for pricing pages,
// feature listings, and other unauthenticated surfaces.
//
// Mutation operations (create/update/upsert/delete/updateMany/deleteMany)
// require an authenticated session with Role.ADMIN.
// ---------------------------------------------------------------------------

export const PLATFORM_MODELS = [
  'subscriptionPlan',
  'planEntitlement',
  'feature',
  'featureBundle',
  'featureBundleItem',
  'featureBundleVersion',
  'featurePrice',
  'featureDependency',
  'pricingCatalog',
  'pricingQuote',
  'pricingQuoteItem',
  'hint',
  'hintLog',
  'billingInvoiceItem',
  'subscriptionStatusHistory',
  'businessSubscriptionFeature',
  'permission',
  'userPermission',
  'roleDefaultPermission',
] as const

export type PlatformModelName = (typeof PLATFORM_MODELS)[number]

const READ_ACTIONS = new Set(['findMany', 'findFirst', 'findUnique', 'count', 'groupBy'])
const MUTATION_ACTIONS = new Set(['create', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'])

type DelegateMethods = 'findMany' | 'findFirst' | 'findUnique' | 'create' | 'update' | 'updateMany' | 'upsert' | 'delete' | 'deleteMany' | 'count' | 'groupBy'

type DB = typeof prisma
type DeepPrettify<T> = T extends Date ? T : T extends object ? { [K in keyof T]: DeepPrettify<T[K]> } & {} : T
type InferResult<T extends PlatformModelName, M extends DelegateMethods, A> = Prisma.Result<DB[T], A, M>

type CoreProxy = {
  [K in PlatformModelName]: <M extends DelegateMethods, A extends Parameters<DB[K][M]>[0]>(
    action: M,
    args?: A,
  ) => Promise<Result<DeepPrettify<InferResult<K, M, A>>, string>>
}

// ---------------------------------------------------------------------------
// Read server function — PUBLIC, no auth required
// ---------------------------------------------------------------------------

const coreReadServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: DBPayload) => d)
  .handler(async ({ data }): Promise<{ value: any } | { error: any }> => {
    if (!PLATFORM_MODELS.includes(data.table as PlatformModelName)) {
      return { error: `coreAPI: "${data.table}" is not a platform-level model. Use crudAPI for tenant data.` }
    }

    if (!READ_ACTIONS.has(data.action)) {
      return { error: `coreAPI read endpoint: "${data.action}" is a mutation. Use the admin-auth endpoint for mutations.` }
    }

    const result = await ResultAsync.fromPromise(executeOperation(prisma, data), (e: any) => e.message || 'Core read operation failed')

    return result.isOk() ? { value: result.value } : { error: result.error }
  })

// ---------------------------------------------------------------------------
// Mutation server function — requires authenticated ADMIN session
// ---------------------------------------------------------------------------

const coreMutationServerFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: DBPayload) => d)
  .handler(async ({ context, data }): Promise<{ value: any } | { error: any }> => {
    // Auth guard — must be logged in
    if (!context?.user?.id) {
      return { error: 'Authentication required for platform mutations.' }
    }

    // Role guard — ADMIN only
    if (context.user.role !== 'ADMIN') {
      return { error: `Platform mutations require ADMIN role. Current role: ${context.user.role}` }
    }

    if (!PLATFORM_MODELS.includes(data.table as PlatformModelName)) {
      return { error: `coreAPI: "${data.table}" is not a platform-level model. Use crudAPI for tenant data.` }
    }

    if (!MUTATION_ACTIONS.has(data.action)) {
      return { error: `coreAPI mutation endpoint: "${data.action}" is a read operation. Use the public read endpoint instead.` }
    }

    const result = await ResultAsync.fromPromise(executeOperation(prisma, data), (e: any) => e.message || 'Core mutation operation failed')

    return result.isOk() ? { value: result.value } : { error: result.error }
  })

// ---------------------------------------------------------------------------
// Exported public API — single proxy, routes internally based on action type
// ---------------------------------------------------------------------------

export const coreAPI = new Proxy({} as CoreProxy, {
  get(_, table: string) {
    return async (action: string, args: any) => {
      const isMutation = MUTATION_ACTIONS.has(action)

      const response = isMutation ? await coreMutationServerFn({ data: { table, action, args } }) : await coreReadServerFn({ data: { table, action, args } })

      if ('error' in response) {
        return err(response.error as string)
      }

      return ok(response.value as any)
    }
  },
})
