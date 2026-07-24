/** biome-ignore-all lint/suspicious/noExplicitAny: allowing any type for flexibility */
import { createServerFn } from '@tanstack/react-start'
import { err, ok, type Result, ResultAsync } from 'neverthrow'
import type { Prisma } from 'prisma/generated/prisma/client'
import { getTenantPrisma, type prisma } from '@/lib/prisma-client'
import { authMiddleware } from '../better-auth/auth-middleware'

// --- ADVANCED TYPES ---

type DB = typeof prisma
type ModelName = Uncapitalize<Prisma.ModelName>
type DelegateMethods = 'findMany' | 'findFirst' | 'findUnique' | 'create' | 'update' | 'updateMany' | 'upsert' | 'delete' | 'deleteMany' | 'count' | 'groupBy'

type DeepPrettify<T> = T extends Date ? T : T extends object ? { [K in keyof T]: DeepPrettify<T[K]> } & {} : T

type DeepStrip<T> = T extends object
  ? {
      [K in keyof T as K extends 'businessId' | 'branchId' ? never : K]: T[K] extends Array<infer U> ? Array<DeepStrip<U>> : DeepStrip<T[K]>
    }
  : T
type CleanArgs<T extends ModelName, M extends DelegateMethods> = DeepStrip<Parameters<DB[T][M]>[0]>
type InferResult<T extends ModelName, M extends DelegateMethods, A> = Prisma.Result<DB[T], A, M>

type CrudProxy = {
  [K in ModelName]: <M extends DelegateMethods, A extends CleanArgs<K, M>>(action: M, args?: A) => Promise<Result<DeepPrettify<InferResult<K, M, A>>, string>>
}

// Export the input payload type so the transaction api can share it
export interface DBPayload {
  table: string
  action: string
  args?: any
}

/**
 * CORE REUSE ENGINER: Resolves the table/model and method dynamically.
 * Accepts any db Client context (global prisma instance or inside a transactional tx client).
 */
export async function executeOperation(dbInstance: any, payload: DBPayload): Promise<any> {
  const delegate = dbInstance[payload.table]

  if (!delegate?.[payload.action]) {
    throw new Error(`Invalid operation: ${payload.action} on ${payload.table}`)
  }

  return await delegate[payload.action](payload.args)
}

// --- SERVER FUNCTION ---

const crudServerFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: DBPayload) => d)
  .handler(async ({ context, data }): Promise<{ value: any } | { error: any }> => {
    const tenantPrisma = getTenantPrisma(context.user.businessId, context.user.branchId!)

    // Reuses the core engine passing the global prisma client instance
    const result = await ResultAsync.fromPromise(executeOperation(tenantPrisma, data), (e: any) => e.message || 'Database operation failed')

    return result.isOk() ? { value: result.value } : { error: result.error }
  })

// --- EXPORTED PUBLIC API ---

export const crudAPI = new Proxy({} as CrudProxy, {
  get(_, table: string) {
    return async (action: string, args: any) => {
      const response = await crudServerFn({
        data: { table, action, args },
      })

      if ('error' in response) {
        return err(response.error as string)
      }

      return ok(response.value as any)
    }
  },
})
