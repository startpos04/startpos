/** biome-ignore-all lint/suspicious/noExplicitAny: allowing any type for flexibility */

import type { prisma } from '@platform/lib/prisma-client'
import type { Prisma } from 'prisma/generated/prisma/client'

// ---------------------------------------------------------------------------
// Shared DB types — used by crudAPI, transactionAPI, and local-db-transaction
// ---------------------------------------------------------------------------

type DB = typeof prisma
type ModelName = Uncapitalize<Prisma.ModelName>
type DelegateMethods = 'findMany' | 'findFirst' | 'findUnique' | 'create' | 'update' | 'updateMany' | 'upsert' | 'delete' | 'deleteMany' | 'count' | 'groupBy'

export type DeepPrettify<T> = T extends Date ? T : T extends object ? { [K in keyof T]: DeepPrettify<T[K]> } & {} : T

export type CleanArgs<T extends ModelName, M extends DelegateMethods> = Parameters<DB[T][M]>[0]
export type InferResult<T extends ModelName, M extends DelegateMethods, A> = Prisma.Result<DB[T], A, M>

export type CrudProxy = {
  [K in ModelName]: <M extends DelegateMethods, A extends CleanArgs<K, M>>(
    action: M,
    args?: A,
  ) => Promise<import('neverthrow').Result<DeepPrettify<InferResult<K, M, A>>, string>>
}

// ---------------------------------------------------------------------------
// DBPayload — the wire format shared between crudAPI, transactionAPI,
// local-db-transaction, and the db/index.tsx sync engine.
// ---------------------------------------------------------------------------

export interface DBPayload {
  table: string
  action: string
  args?: any
}

// ---------------------------------------------------------------------------
// executeOperation — pure DB helper, no middleware, no tenant scoping.
//
// Accepts any Prisma client instance (global, tenant-scoped, or tx client)
// so it can be reused in server functions, transactions, and local sync.
// ---------------------------------------------------------------------------

export async function executeOperation(dbInstance: any, payload: DBPayload): Promise<any> {
  const delegate = dbInstance[payload.table]

  if (!delegate?.[payload.action]) {
    throw new Error(`Invalid operation: ${payload.action} on ${payload.table}`)
  }

  return await delegate[payload.action](payload.args)
}
