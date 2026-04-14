import { getTenantPrisma, prisma } from '@/lib/prisma-client'
import { createServerFn } from '@tanstack/react-start'
import { err, ok, Result, ResultAsync } from 'neverthrow'
import { Prisma } from 'prisma/generated/prisma/client'
import { authMiddleware } from '../better-auth/auth-middleware'

// --- ADVANCED TYPES ---

type DB = typeof prisma
type ModelName = Uncapitalize<Prisma.ModelName>
type DelegateMethods = 'findMany' | 'findFirst' | 'findUnique' | 'create' | 'update' | 'updateMany' | 'upsert' | 'delete' | 'deleteMany' | 'count'

/**
 * DeepPrettify: Resolves intersections into clean objects for the IDE.
 */
type DeepPrettify<T> = T extends Date ? T : T extends object ? { [K in keyof T]: DeepPrettify<T[K]> } & {} : T

/**
 * DeepStrip: Recursively removes organizationId and branchId from the input types.
 * This keeps your frontend code clean while the server handles the multi-tenancy.
 */
type DeepStrip<T> = T extends object
  ? {
      [K in keyof T as K extends 'organizationId' | 'branchId' ? never : K]: T[K] extends Array<infer U> ? Array<DeepStrip<U>> : DeepStrip<T[K]>
    }
  : T

/**
 * We take the Prisma args, strip the tenant fields, and then
 * use that for the API input.
 */
type CleanArgs<T extends ModelName, M extends DelegateMethods> = DeepStrip<Parameters<DB[T][M]>[0]>

/**
 * We still use the original unstripped 'A' for Result inference
 * to ensure Prisma knows exactly what was included/selected.
 */
type InferResult<T extends ModelName, M extends DelegateMethods, A> = Prisma.Result<DB[T], A, M>

type CrudProxy = {
  [K in ModelName]: <M extends DelegateMethods, A extends CleanArgs<K, M>>(action: M, args?: A) => Promise<Result<DeepPrettify<InferResult<K, M, A>>, string>>
}

// --- SERVER FUNCTION ---

const crudServerFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: { table: string; action: string; args?: any }) => d)
  .handler(async ({ context, data }): Promise<{ value: any } | { error: any }> => {
    // The server ignores whatever IDs might have been sent and uses the Auth Context
    const tenantPrisma = getTenantPrisma(context.user.organizationId, context.user.branchId!)
    const delegate = (tenantPrisma as any)[data.table]

    if (!delegate || !delegate[data.action]) {
      return { error: `Invalid operation: ${data.action} on ${data.table}` }
    }

    const result = await ResultAsync.fromPromise(delegate[data.action](data.args), (e: any) => e.message || 'Database operation failed')

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
