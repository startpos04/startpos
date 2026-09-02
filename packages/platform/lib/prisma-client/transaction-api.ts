// transaction-api.ts — package layer
//
// The full transactionAPI server function (with authMiddleware, tenant scoping,
// permission gates, and usage counter reconciliation) lives in the app layer:
//   apps/web/src/lib/prisma-client/transaction-api.ts
//
// This file re-exports the shared primitives that both the app's server function
// and the local db sync engine (db/local-db-transaction.ts) need.

export { executeOperation, type DBPayload } from './crud-api'
