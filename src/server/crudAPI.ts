import { db } from '@/lib/db'
import { createServerFn } from '@tanstack/react-start'

type DB = typeof db

// Only keep Prisma model delegates
type ModelName = {
  [K in keyof DB]: DB[K] extends { findFirst: (...args: any) => any } ? K : never
}[keyof DB]

// Extract only function keys from a delegate
type DelegateMethods<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never
}[keyof T]

// Extract args
type PrismaArgs<T extends ModelName, M extends DelegateMethods<DB[T]>> = DB[T][M] extends (args: infer A) => any ? A : never

// Extract return type
type PrismaReturn<T extends ModelName, M extends DelegateMethods<DB[T]>> = DB[T][M] extends (...args: any[]) => infer R ? Awaited<R> : never

const crudServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { table: ModelName; action: string; args?: unknown }) => d)
  .handler(async ({ data }) => {
    const delegate = db[data.table] as any
    return delegate[data.action](data.args)
  })

export function crudAPI<T extends ModelName, M extends DelegateMethods<DB[T]>>(input: {
  data: {
    table: T
    action: M
    args?: PrismaArgs<T, M>
  }
}): Promise<PrismaReturn<T, M>> {
  return crudServerFn(input as any)
}
