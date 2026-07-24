/** biome-ignore-all lint/suspicious/noExplicitAny: allowing any type for flexibility */
import { createServerFn } from '@tanstack/react-start'
import { err, ok, type Result, ResultAsync } from 'neverthrow'
import { prisma } from '@/lib/prisma-client'
import { authMiddleware } from '../better-auth/auth-middleware'
// Import the shared execution engine directly from your crud-api file
import { type DBPayload, executeOperation } from './crud-api'

interface TransactionInput {
  operations: DBPayload[]
}

// --- TRANSACTION SERVER FUNCTION ---

const transactionServerFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: TransactionInput) => d)
  .handler(async ({ data }): Promise<{ value: any[] } | { error: any }> => {
    const txResult = await ResultAsync.fromPromise(
      prisma.$transaction(async tx => {
        const executionResults = []

        for (const op of data.operations) {
          // Reuses the exact same logic, validation checks, and formatting rules
          const out = await executeOperation(tx, op)
          executionResults.push(out)
        }

        return executionResults
      }),
      (e: any) => e.message || 'Transaction batch execution failed',
    )

    return txResult.isOk() ? { value: txResult.value } : { error: txResult.error }
  })

// --- EXPORTED PUBLIC API ---

export const transactionAPI = {
  execute: async (operations: DBPayload[]): Promise<Result<any[], string>> => {
    const response = await transactionServerFn({
      data: { operations },
    })

    if ('error' in response) {
      return err(response.error as string)
    }

    return ok(response.value)
  },
}
