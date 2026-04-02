import { getTenantPrisma, prisma } from '@/lib/prisma-client'
import { createServerFn } from '@tanstack/react-start'
import { err, ok, Result, ResultAsync } from 'neverthrow'
import { Prisma } from 'prisma/generated/prisma/client'
import { authMiddleware } from '../better-auth/auth-middleware'
import { Prettify } from '../types'

type DB = typeof prisma

type ModelName = Uncapitalize<Prisma.ModelName>
type DelegateMethods = 'findMany' | 'findFirst' | 'findUnique' | 'create' | 'update' | 'upsert' | 'delete' | 'deleteMany'

// Result Inference
type InferResult<M extends ModelName, A extends DelegateMethods, Args> = Prisma.Result<DB[M], Args, A>

// THE SERVER FUNCTION
const crudServerFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: { table: ModelName; action: DelegateMethods; args?: any }) => d)
  .handler(async ({ context, data }): Promise<{ value: any } | { error: any }> => {
    const tenantPrisma = getTenantPrisma(context.user.organizationId, context.user.branchId!)

    // We cast to any here because we are handling the type safety
    // at the public API level (crudAPI)
    const delegate = (tenantPrisma as any)[data.table]

    const result = await ResultAsync.fromPromise(delegate[data.action](data.args), (e: any) => e.message || 'Database operation failed')

    if (result.isOk()) {
      return { value: result.value }
    }

    return { error: result.error }
  })

// THE PUBLIC API
export async function crudAPI<T extends ModelName, M extends DelegateMethods, A extends Parameters<DB[T][M]>[0]>(input: {
  data: { table: T; action: M; args?: A }
}): Promise<Prettify<Result<InferResult<T, M, A>, string>>> {
  const response = await crudServerFn(input as any)

  if ('error' in response) {
    return err(response.error as string)
  }

  return ok(response.value as any)
}
