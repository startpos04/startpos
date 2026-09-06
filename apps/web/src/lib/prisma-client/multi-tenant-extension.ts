/** biome-ignore-all lint/suspicious/noExplicitAny: allowing any type for flexibility */

/**
 * multi-tenant-extension.ts — Web-layer tenant scoping
 *
 * Business/branch scoping is a web-app concern — the platform package
 * knows nothing about the Business/Branch tenant model.
 *
 * This Prisma extension automatically injects `businessId` and `branchId`
 * into every query so callers never pass them manually. Use via getTenantPrisma:
 *
 *   import { getTenantPrisma } from '@/lib/prisma-client'
 *   const prisma = getTenantPrisma(businessId, branchId)
 *   const products = await prisma.product.findMany() // scoped automatically
 */

import { SCHEMA_METADATA } from 'prisma/generated/metadata'
import { Prisma } from 'prisma/generated/prisma/client'

// ---------------------------------------------------------------------------
// Type utilities
// ---------------------------------------------------------------------------

/** Strips businessId/branchId from caller-supplied args — the extension injects them */
type StripTenant<T> = T extends object
  ? {
      [K in keyof T]?: K extends 'businessId' | 'branchId' ? T[K] | undefined | null : T[K] extends (infer U)[] ? StripTenant<U>[] : StripTenant<T[K]>
    }
  : T

/** Maps a Prisma client so all method signatures have tenant IDs stripped */
export type TenantAwareClient<T> = {
  [K in keyof T]: K extends '$transaction'
    ? <R>(fn: (tx: TenantAwareClient<T>) => Promise<R>, options?: { isolationLevel?: Prisma.TransactionIsolationLevel }) => Promise<R>
    : T[K] extends (...args: infer A) => infer R
      ? (...args: StripTenant<A>) => R
      : T[K] extends object
        ? TenantAwareClient<T[K]>
        : T[K]
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export const multiTenantExtension = (businessId: string, branchId?: string) => {
  return Prisma.defineExtension({
    name: 'multiTenant',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: any) {
          // Models with no businessId/branchId column — skip data injection entirely.
          const fullBypassModels = ['Business', 'Account', 'Session']
          if (fullBypassModels.includes(model)) return query(args)

          // User has no businessId column. Scope reads via the Membership relation
          // so tenants never see each other's users.
          if (model === 'User') {
            const readOps = ['findFirst', 'findMany', 'findUnique', 'findUniqueOrThrow', 'count']
            if (readOps.includes(operation)) {
              args.where = args.where ?? {}
              args.where.memberships = args.where.memberships ?? {
                some: {
                  businessId,
                  ...(branchId ? { branchId } : {}),
                },
              }
            }
            return query(args)
          }

          const modelKey = model as keyof typeof SCHEMA_METADATA
          const topLevelMeta = SCHEMA_METADATA[modelKey]

          const relations = (topLevelMeta as any)?.relations as Record<string, string> | undefined
          const hasOrg = relations?.['business'] === 'Business'
          const hasBranch = relations?.['branch'] === 'Branch'

          const injectIds = (data: any, currentModelName: string) => {
            const meta = SCHEMA_METADATA[currentModelName as keyof typeof SCHEMA_METADATA]
            if (!meta || !data || typeof data !== 'object') return

            const metaRelations = (meta as any)?.relations as Record<string, string> | undefined
            const metaHasOrg = metaRelations?.['business'] === 'Business'
            const metaHasBranch = metaRelations?.['branch'] === 'Branch'

            const itemsToProcess = Array.isArray(data) ? data : [data]
            itemsToProcess.forEach(item => {
              if (metaHasOrg) item.businessId = businessId
              if (metaHasBranch && branchId) item.branchId = branchId
            })

            if (!Array.isArray(data)) {
              for (const key in data) {
                const relations = meta.relations as Record<string, string>
                const nestedModelName = relations[key]

                if (nestedModelName && data[key]) {
                  const nestedData = data[key]

                  ;['create', 'update', 'upsert', 'createMany', 'connectOrCreate', 'connect'].forEach(op => {
                    if (nestedData[op]) {
                      if (op === 'createMany' && nestedData[op].data) {
                        injectIds(nestedData[op].data, nestedModelName)
                      } else if (op === 'upsert') {
                        const upsertItems = Array.isArray(nestedData[op]) ? nestedData[op] : [nestedData[op]]
                        upsertItems.forEach(item => {
                          if (item.create) injectIds(item.create, nestedModelName)
                          if (item.update) injectIds(item.update, nestedModelName)
                          if (item.where) {
                            const nestedMeta = SCHEMA_METADATA[nestedModelName as keyof typeof SCHEMA_METADATA]
                            const nestedRelations = (nestedMeta as any)?.relations as Record<string, string> | undefined
                            if (nestedRelations?.['business'] === 'Business') item.where.businessId = businessId
                          }
                        })
                      } else if (op === 'connectOrCreate') {
                        const items = Array.isArray(nestedData[op]) ? nestedData[op] : [nestedData[op]]
                        items.forEach(item => {
                          if (item.create) injectIds(item.create, nestedModelName)
                          if (item.where && metaHasOrg) item.where.businessId = businessId
                        })
                      } else {
                        const items = Array.isArray(nestedData[op]) ? nestedData[op] : [nestedData[op]]
                        items.forEach(item => {
                          injectIds(item, nestedModelName)
                        })
                      }
                    }
                  })
                }
              }
            }
          }

          if (args.data) {
            if (operation === 'createMany' && args.data.data) {
              injectIds(args.data.data, model)
            } else {
              injectIds(args.data, model)
            }
          }

          if (operation === 'upsert') {
            if (args.create) injectIds(args.create, model)
            if (args.update) injectIds(args.update, model)
            if (args.create) delete (args.create as any).id
          }

          const filterOps = ['findFirst', 'findMany', 'findUnique', 'findUniqueOrThrow', 'update', 'updateMany', 'delete', 'deleteMany', 'count', 'upsert']

          if (filterOps.includes(operation)) {
            args.where = args.where || {}
            if (args.where.businessId && args.where.businessId !== businessId) {
              throw new Error(`Unauthorized access to Business ${args.where.businessId}`)
            }
            if (hasOrg) args.where.businessId = businessId
            if (hasBranch && branchId) args.where.branchId = branchId
          }

          return query(args)
        },
      },
    },
  })
}
