/** biome-ignore-all lint/suspicious/noExplicitAny: allowing any type for flexibility */
import { SCHEMA_METADATA } from 'prisma/generated/metadata'
import { Prisma } from 'prisma/generated/prisma/client'

/**
 * 1. The Recursive Stripper
 * This handles the 'data' and 'where' objects for the Frontend Types.
 */
type StripTenant<T> = T extends object
  ? {
      [K in keyof T]?: K extends 'businessId' | 'branchId' ? T[K] | undefined | null : T[K] extends (infer U)[] ? StripTenant<U>[] : StripTenant<T[K]>
    }
  : T

/**
 * 2. The Smart Client Mapper
 */
export type TenantAwareClient<T> = {
  [K in keyof T]: K extends '$transaction'
    ? <R>(fn: (tx: TenantAwareClient<T>) => Promise<R>, options?: { isolationLevel?: Prisma.TransactionIsolationLevel }) => Promise<R>
    : T[K] extends (...args: infer A) => infer R
      ? (...args: StripTenant<A>) => R
      : T[K] extends object
        ? TenantAwareClient<T[K]>
        : T[K]
}

export const multiTenantExtension = (businessId: string, branchId?: string) => {
  return Prisma.defineExtension({
    name: 'multiTenant',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: any) {
          // Models with no businessId/branchId column — skip data injection entirely.
          // Session and Account are pure auth infrastructure; never tenant-scoped.
          const fullBypassModels = ['Business', 'Account', 'Session']
          if (fullBypassModels.includes(model)) return query(args)

          // User has no businessId column, so we cannot inject businessId into
          // data writes or WHERE clauses directly. However, read operations MUST
          // be scoped to the current tenant via the Membership relation — otherwise
          // every tenant sees all users on the platform.
          if (model === 'User') {
            const readOps = ['findFirst', 'findMany', 'findUnique', 'findUniqueOrThrow', 'count']
            if (readOps.includes(operation)) {
              args.where = args.where ?? {}
              // Scope reads to users who have a Membership in this business+branch.
              // This is additive — callers can still add their own where conditions.
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

          // Derive hasOrg/hasBranch from the relations map.
          // Every model with a "business": "Business" relation has a businessId column.
          // Every model with a "branch": "Branch" relation has a branchId column.
          // The generated metadata does not carry explicit hasOrg/hasBranch flags,
          // so we derive them here — this is the single source of truth.
          const relations = (topLevelMeta as any)?.relations as Record<string, string> | undefined
          const hasOrg = relations?.['business'] === 'Business'
          const hasBranch = relations?.['branch'] === 'Branch'

          /**
           * RECURSIVE INJECTOR
           * Fixed to avoid injecting IDs into Prisma wrapper objects (like createMany)
           */
          const injectIds = (data: any, currentModelName: string) => {
            const meta = SCHEMA_METADATA[currentModelName as keyof typeof SCHEMA_METADATA]
            if (!meta || !data || typeof data !== 'object') return

            // Derive hasOrg/hasBranch from relations (same pattern as top-level)
            const metaRelations = (meta as any)?.relations as Record<string, string> | undefined
            const metaHasOrg = metaRelations?.['business'] === 'Business'
            const metaHasBranch = metaRelations?.['branch'] === 'Branch'

            // 1. Inject IDs into the current object(s)
            const itemsToProcess = Array.isArray(data) ? data : [data]

            itemsToProcess.forEach(item => {
              if (metaHasOrg) item.businessId = businessId
              if (metaHasBranch && branchId) item.branchId = branchId
            })

            // 2. Look for nested relations
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
                        // FIX: Upsert can be an array or a single object
                        const upsertItems = Array.isArray(nestedData[op]) ? nestedData[op] : [nestedData[op]]
                        upsertItems.forEach(item => {
                          // Inject into the 'create' block
                          if (item.create) injectIds(item.create, nestedModelName)
                          // Inject into the 'update' block
                          if (item.update) injectIds(item.update, nestedModelName)
                          // IMPORTANT: Inject into the 'where' block to ensure tenant isolation
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

          // --- 1. DATA INJECTION ---
          if (args.data) {
            if (operation === 'createMany' && args.data.data) {
              // Top-level createMany: inject into the array items only
              injectIds(args.data.data, model)
            } else {
              injectIds(args.data, model)
            }
          }

          // Top-level Upsert Handling
          if (operation === 'upsert') {
            if (args.create) injectIds(args.create, model)
            if (args.update) injectIds(args.update, model)
            if (args.create) delete (args.create as any).id
          }

          // --- 2. WHERE CLAUSE SCOPING ---
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
