/** biome-ignore-all lint/suspicious/noExplicitAny: fix later */
import { createTransaction, type Transaction } from '@tanstack/db'
import { ResultAsync } from 'neverthrow'
import type { DBPayload } from '@/lib/prisma-client/crud-api'
import { transactionAPI } from '@/lib/prisma-client/transaction-api'

type CollectionWriteUtils = {
  writeInsert?: (data: unknown) => void
  writeUpsert?: (data: unknown) => void
  writeDelete?: (key: string) => void
  writeBatch?: (callback: () => void) => void
  refetch?: (opts?: { throwOnError?: boolean }) => Promise<unknown>
}

type MutationEntry = {
  mutation: Transaction<any>['mutations'][number]
  serverResult: unknown
}

function buildOperations(transaction: Transaction<any>): DBPayload[] {
  const operations: DBPayload[] = []

  for (const mutation of transaction.mutations) {
    if (mutation.type === 'insert') {
      operations.push({ table: mutation.collection.id, action: 'create', args: { data: mutation.modified } })
    } else if (mutation.type === 'update') {
      operations.push({
        table: mutation.collection.id,
        action: 'update',
        args: {
          where: { id: (mutation.original as any).id },
          data: mutation.changes,
        },
      })
    } else if (mutation.type === 'delete') {
      operations.push({ table: mutation.collection.id, action: 'delete', args: { where: { id: (mutation.original as any).id } } })
    }
  }

  return operations
}

function groupMutationsByCollection(mutations: Transaction<any>['mutations'], serverResults: unknown[]) {
  const grouped = new Map<any, MutationEntry[]>()

  for (let i = 0; i < mutations.length; i++) {
    const mutation = mutations[i]
    if (!mutation) continue

    const entries = grouped.get(mutation.collection) ?? []
    entries.push({ mutation, serverResult: serverResults[i] })
    grouped.set(mutation.collection, entries)
  }

  return grouped
}

function applyServerResultsToCollection(collection: any, entries: MutationEntry[]) {
  const utils = collection.utils as CollectionWriteUtils | undefined

  const applyEntry = (entry: MutationEntry) => {
    switch (entry.mutation.type) {
      case 'insert':
        if (!utils?.writeInsert) throw new Error(`Missing writeInsert on "${collection.id}"`)
        utils.writeInsert(entry.serverResult)
        break
      case 'update':
        if (!utils?.writeUpsert) throw new Error(`Missing writeUpsert on "${collection.id}"`)
        utils.writeUpsert(entry.serverResult)
        break
      case 'delete':
        if (!utils?.writeDelete) throw new Error(`Missing writeDelete on "${collection.id}"`)
        utils.writeDelete((entry.mutation.original as { id: string }).id)
        break
    }
  }

  if (typeof utils?.writeBatch === 'function') {
    utils.writeBatch(() => {
      for (const entry of entries) {
        applyEntry(entry)
      }
    })
    return
  }

  for (const entry of entries) {
    applyEntry(entry)
  }
}

async function syncCollectionAfterManualTransaction(collection: any, entries: MutationEntry[]) {
  try {
    applyServerResultsToCollection(collection, entries)
  } catch {
    const refetch = (collection.utils as CollectionWriteUtils | undefined)?.refetch
    if (typeof refetch !== 'function') {
      throw new Error(`Failed to sync collection "${collection.id}" after manual transaction`)
    }

    await refetch({ throwOnError: true })
  }
}

async function syncCollectionsAfterManualTransaction(transaction: Transaction<any>, serverResults: unknown[]) {
  const grouped = groupMutationsByCollection(transaction.mutations, serverResults)

  await Promise.all(Array.from(grouped.entries()).map(([collection, entries]) => syncCollectionAfterManualTransaction(collection, entries)))
}

async function applyLocalTransaction(transaction: Transaction<any>): Promise<unknown[]> {
  const results = transaction.mutations.map(mutation => {
    if (mutation.type === 'insert') return mutation.modified
    if (mutation.type === 'update') return { ...(mutation.original as object), ...mutation.changes }
    return mutation.original
  })

  await syncCollectionsAfterManualTransaction(transaction, results)
  return results
}

export const dbTransaction = <T>(callback: () => T): ResultAsync<T, Error> => {
  return ResultAsync.fromPromise(
    (async () => {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine

      let callbackResult!: T

      const tx = createTransaction({
        mutationFn: async ({ transaction }) => {
          if (isOffline) {
            const results = await applyLocalTransaction(transaction)
            return results
          }

          const result = await transactionAPI.execute(buildOperations(transaction))

          if (result.isErr()) {
            throw new Error(result.error)
          }

          // Apply server rows directly to the local sync store (no extra findMany calls).
          // Falls back to collection refetch only if targeted writes fail.
          await syncCollectionsAfterManualTransaction(transaction, result.value)

          return result.value
        },
      })

      tx.mutate(() => {
        callbackResult = callback()
      })
      await tx.isPersisted.promise

      return callbackResult
    })(),
    error => (error instanceof Error ? error : new Error(String(error))),
  )
}
