import { prisma } from '@/lib/prisma-client'
import { Decimal } from '@prisma/client/runtime/client'
import { createServerFn } from '@tanstack/react-start'
import { Prisma } from 'prisma/generated/prisma/browser'

type DB = typeof prisma

// 1. Improved FixDecimal: Handles arrays and objects more efficiently
type FixDecimal<T> = T extends Decimal
  ? number
  : T extends Date
    ? Date
    : T extends Array<infer U>
      ? FixDecimal<U>[]
      : T extends object
        ? { [K in keyof T]: FixDecimal<T[K]> }
        : T

// 2. Extract Names (Keep these simple)
type ModelName = Uncapitalize<Prisma.ModelName>
type DelegateMethods = 'findMany' | 'findFirst' | 'findUnique' | 'create' | 'update' | 'upsert' | 'delete'

/**
 * 3. THE OPTIMIZED INFERRER
 * We use Prisma.Args and Prisma.Result but scope them strictly to the Model and Action.
 */
type InferResult<M extends ModelName, A extends DelegateMethods, Args> = Prisma.Result<DB[M], Args, A>

/**
 * Utility to convert Decimal to Number at Runtime
 */
function decimalToNumber(obj: any): any {
  if (obj === null || obj === undefined) return obj
  if (Prisma.Decimal.isDecimal(obj)) return obj.toNumber()
  if (Array.isArray(obj)) return obj.map(decimalToNumber)
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, decimalToNumber(v)]))
  }
  return obj
}

const crudServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { table: ModelName; action: DelegateMethods; args?: any }) => d)
  .handler(async ({ data }) => {
    const delegate = (prisma as any)[data.table]
    const result = await delegate[data.action](data.args)
    return decimalToNumber(result)
  })

/**
 * THE PUBLIC API
 */
export async function crudAPI<
  T extends ModelName,
  M extends DelegateMethods,
  // This extracts the specific argument type for the chosen model and action
  A extends Parameters<DB[T][M]>[0],
>(input: { data: { table: T; action: M; args?: A } }): Promise<FixDecimal<InferResult<T, M, A>>> {
  const result = await crudServerFn(input as any)
  return result as any
}
