/** biome-ignore-all lint/suspicious/noExplicitAny: allowing any type for flexibility */

import { prisma } from '@platform/lib/prisma-client'
import { createServerFn } from '@tanstack/react-start'
import { err, ok, type Result, ResultAsync } from 'neverthrow'
import type { Prisma } from 'prisma/generated/prisma/client'
import { platformAuthMiddleware as authMiddleware } from '../better-auth/create-auth-middleware'
import { getServerContext } from '../better-auth/server-context'
import { type DBPayload, executeOperation } from './crud-api'

// ---------------------------------------------------------------------------
// Platform-level model whitelists
//
// PUBLIC_PLATFORM_MODELS:
//   Read operations require NO auth — safe for pricing pages, feature
//   listings, and other unauthenticated surfaces.
//
// AUTH_PLATFORM_MODELS:
//   Read operations require an authenticated session — these contain
//   sensitive authorization data (permission grants, role defaults) that
//   must not be publicly readable.
//
// Mutation operations on ALL platform models require ADMIN role.
// ---------------------------------------------------------------------------

export const PUBLIC_PLATFORM_MODELS = [
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
] as const

export const AUTH_PLATFORM_MODELS = ['permission', 'userPermission', 'roleDefaultPermission'] as const

export const PLATFORM_MODELS = [...PUBLIC_PLATFORM_MODELS, ...AUTH_PLATFORM_MODELS] as const

export type PublicPlatformModelName = (typeof PUBLIC_PLATFORM_MODELS)[number]
export type AuthPlatformModelName = (typeof AUTH_PLATFORM_MODELS)[number]
export type PlatformModelName = (typeof PLATFORM_MODELS)[number]

const PUBLIC_PLATFORM_MODELS_SET = new Set<string>(PUBLIC_PLATFORM_MODELS)
const AUTH_PLATFORM_MODELS_SET = new Set<string>(AUTH_PLATFORM_MODELS)
const PLATFORM_MODELS_SET = new Set<string>(PLATFORM_MODELS)

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
// Public read server function — no auth required
// Only serves PUBLIC_PLATFORM_MODELS
// ---------------------------------------------------------------------------

const coreReadServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: DBPayload) => d)
  .handler(async ({ data }): Promise<{ value: any } | { error: any }> => {
    if (!PUBLIC_PLATFORM_MODELS_SET.has(data.table)) {
      if (AUTH_PLATFORM_MODELS_SET.has(data.table)) {
        return { error: `coreAPI: "${data.table}" requires authentication. Use coreAPI from an authenticated context.` }
      }
      return { error: `coreAPI: "${data.table}" is not a platform-level model. Use crudAPI for tenant data.` }
    }

    if (!READ_ACTIONS.has(data.action)) {
      return { error: `coreAPI read endpoint: "${data.action}" is a mutation. Use the admin-auth endpoint for mutations.` }
    }

    const result = await ResultAsync.fromPromise(executeOperation(prisma, data), (e: any) => e.message || 'Core read operation failed')

    return result.isOk() ? { value: result.value } : { error: result.error }
  })

// ---------------------------------------------------------------------------
// Authenticated read server function — requires valid session
// Serves AUTH_PLATFORM_MODELS reads
// ---------------------------------------------------------------------------

const coreAuthReadServerFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: DBPayload) => d)
  .handler(async ({ context, data }): Promise<{ value: any } | { error: any }> => {
    if (!getServerContext(context).user?.id) {
      return { error: 'Authentication required to read authorization data.' }
    }

    if (!AUTH_PLATFORM_MODELS_SET.has(data.table)) {
      return { error: `coreAPI auth-read: "${data.table}" does not require authentication. Use the public endpoint.` }
    }

    if (!READ_ACTIONS.has(data.action)) {
      return { error: `coreAPI read endpoint: "${data.action}" is a mutation. Use the admin-auth endpoint for mutations.` }
    }

    const result = await ResultAsync.fromPromise(executeOperation(prisma, data), (e: any) => e.message || 'Core auth-read operation failed')

    return result.isOk() ? { value: result.value } : { error: result.error }
  })

// ---------------------------------------------------------------------------
// Mutation server function — requires authenticated ADMIN session
// ---------------------------------------------------------------------------

const coreMutationServerFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: DBPayload) => d)
  .handler(async ({ context, data }): Promise<{ value: any } | { error: any }> => {
    if (!getServerContext(context).user?.id) {
      return { error: 'Authentication required for platform mutations.' }
    }

    if (getServerContext(context).user.role !== 'ADMIN') {
      return { error: `Platform mutations require ADMIN role. Current role: ${getServerContext(context).user.role}` }
    }

    if (!PLATFORM_MODELS_SET.has(data.table)) {
      return { error: `coreAPI: "${data.table}" is not a platform-level model. Use crudAPI for tenant data.` }
    }

    if (!MUTATION_ACTIONS.has(data.action)) {
      return { error: `coreAPI mutation endpoint: "${data.action}" is a read operation. Use the read endpoint instead.` }
    }

    const result = await ResultAsync.fromPromise(executeOperation(prisma, data), (e: any) => e.message || 'Core mutation operation failed')

    return result.isOk() ? { value: result.value } : { error: result.error }
  })

// ---------------------------------------------------------------------------
// Exported public API — single proxy, routes internally based on model + action
// ---------------------------------------------------------------------------

export const coreAPI = new Proxy({} as CoreProxy, {
  get(_, table: string) {
    return async (action: string, args: any) => {
      const isMutation = MUTATION_ACTIONS.has(action)
      const isAuthRead = !isMutation && AUTH_PLATFORM_MODELS_SET.has(table)

      const response = isMutation
        ? await coreMutationServerFn({ data: { table, action, args } })
        : isAuthRead
          ? await coreAuthReadServerFn({ data: { table, action, args } })
          : await coreReadServerFn({ data: { table, action, args } })

      if ('error' in response) return err(response.error as string)
      return ok(response.value as any)
    }
  },
})
