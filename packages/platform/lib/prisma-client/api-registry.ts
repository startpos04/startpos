/**
 * api-registry.ts — Data API provider registry
 *
 * Apps register their crudAPI and transactionAPI implementations at startup
 * so the package's db layer (db/index.tsx, db/local-db-transaction.ts) can
 * call them without importing from the app layer.
 *
 * Usage (apps/web/src/lib/prisma-client/setup.ts or similar):
 *   import { registerDataAPIs } from '@platform/lib/prisma-client/api-registry'
 *   import { crudAPI } from '@/lib/prisma-client/crud-api'
 *   import { transactionAPI } from '@/lib/prisma-client/transaction-api'
 *   registerDataAPIs({ crudAPI, transactionAPI })
 */

import type { DBPayload } from './crud-api'
import type { Result } from 'neverthrow'

export interface CrudAPILike {
  [table: string]: (action: string, args?: any) => Promise<Result<any, string>>
}

export interface TransactionAPILike {
  execute: (operations: DBPayload[]) => Promise<Result<any[], string>>
}

let _crudAPI: CrudAPILike | null = null
let _transactionAPI: TransactionAPILike | null = null

export const registerDataAPIs = (apis: { crudAPI: CrudAPILike; transactionAPI: TransactionAPILike }): void => {
  _crudAPI = apis.crudAPI
  _transactionAPI = apis.transactionAPI
}

export const getCrudAPI = (): CrudAPILike => {
  if (!_crudAPI) throw new Error('[api-registry] crudAPI not registered. Call registerDataAPIs() at app startup.')
  return _crudAPI
}

export const getTransactionAPI = (): TransactionAPILike => {
  if (!_transactionAPI) throw new Error('[api-registry] transactionAPI not registered. Call registerDataAPIs() at app startup.')
  return _transactionAPI
}
