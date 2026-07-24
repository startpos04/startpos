/** biome-ignore-all lint/suspicious/noExplicitAny: we can't be more specific about the types here without sacrificing flexibility but please to minimize it as possible */
import {
  type BrowserWASQLiteDatabase,
  createBrowserWASQLitePersistence,
  openBrowserWASQLiteOPFSDatabase,
  type PersistedCollectionPersistence,
  persistedCollectionOptions,
} from '@tanstack/browser-db-sqlite-persistence'
import { BasicIndex, type Collection, createCollection, parseLoadSubsetOptions, type SyncMode } from '@tanstack/db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import utc from 'dayjs/plugin/utc'
import dayjs from '@/lib/dayjs'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { getQueryClient } from '@/lib/query-client'

dayjs.extend(utc)

const api = crudAPI as any

let localDB = null as unknown as BrowserWASQLiteDatabase
export let persistence = null as unknown as PersistedCollectionPersistence

if (typeof window !== 'undefined') {
  localDB = await openBrowserWASQLiteOPFSDatabase({
    databaseName: 'pos_offline_storage_v2.sqlite',
  })

  persistence = createBrowserWASQLitePersistence({
    database: localDB,
  })
}

const bc = typeof window !== 'undefined' ? new BroadcastChannel('db_sync') : null
const dbSyncTabId = typeof window !== 'undefined' ? crypto.randomUUID() : ''

type DbSyncBroadcastMessage = {
  apiKey: string
  fromTab: string
}

function parseDbSyncBroadcastMessage(data: unknown): DbSyncBroadcastMessage | null {
  if (typeof data === 'string') {
    return { apiKey: data, fromTab: '' }
  }

  if (typeof data !== 'object' || data === null) return null

  const message = data as Partial<DbSyncBroadcastMessage>
  if (typeof message.apiKey !== 'string') return null

  return {
    apiKey: message.apiKey,
    fromTab: typeof message.fromTab === 'string' ? message.fromTab : '',
  }
}

interface SyncableRecord {
  id: string
}

interface CreateSyncableCollectionConfigs {
  syncMode: SyncMode
  schemaVersion: number
  apiKey: keyof typeof crudAPI
}

/**
 * Generic retry utility with exponential backoff handling network/DB stalls
 */
async function retryWithBackoff<T>(fn: () => Promise<{ isErr: () => boolean; error: any; value: T }>, retries = 3, delay = 200): Promise<T> {
  let lastError: any = null
  for (let i = 0; i < retries; i++) {
    try {
      const result = await fn()
      if (!result.isErr()) return result.value
      lastError = new Error(result.error)
    } catch (err) {
      lastError = err
    }
    if (i < retries - 1) {
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)))
    }
  }
  throw lastError
}

/**
 * @template TRecord - The full schema ModelSchema
 */
export function createSyncableCollection<TRecord extends SyncableRecord>(config: CreateSyncableCollectionConfigs): Collection<TRecord> {
  if (typeof window === 'undefined') return {} as Collection<TRecord>
  const queryClient = getQueryClient()

  const collection = createCollection(
    persistedCollectionOptions({
      id: config.apiKey,
      persistence,
      schemaVersion: config.schemaVersion,
      autoIndex: 'eager',
      defaultIndexType: BasicIndex,
      ...queryCollectionOptions({
        queryClient,
        queryKey: [config.apiKey],
        syncMode: config.syncMode,
        getKey: (item: TRecord) => item.id,

        queryFn: async ctx => {
          if (typeof navigator !== 'undefined' && !navigator.onLine) return []
          const options = parseLoadSubsetOptions(ctx.meta?.loadSubsetOptions)

          const where: Record<string, any> = {}
          if (options.filters) {
            for (const filter of options.filters) {
              const prismaComparatorMap: Record<string, string> = {
                eq: 'equals',
                gt: 'gt',
                gte: 'gte',
                lt: 'lt',
                lte: 'lte',
                contains: 'contains',
                in: 'in',
              }

              const operator = prismaComparatorMap[filter.operator] || filter.operator

              where[filter.field as any] = {
                [operator]: filter.value,
                ...(filter.operator === 'contains' ? { mode: 'insensitive' } : {}),
              }
            }
          }

          const orderBy = options.sorts?.map(s => ({ [s.field as any]: s.direction }))

          const result = await api[config.apiKey]('findMany', {
            where,
            orderBy,
            take: options.limit,
          })

          if (result.isErr()) throw new Error(result.error)
          return result.value
        },

        onInsert: async ({ transaction }) => {
          const results: TRecord[] = []

          for (const mutation of transaction.mutations) {
            const input = mutation.modified

            if (typeof navigator !== 'undefined' && !navigator.onLine) {
              results.push(input)
              continue
            }

            // Executes safely with backoff retries and casts types cleanly
            const value = await retryWithBackoff(() => api[config.apiKey]('create', { data: input }))

            results.push(value as TRecord)
          }
          return results
        },

        onUpdate: async ({ transaction }) => {
          const results: TRecord[] = []

          for (const mutation of transaction.mutations) {
            const updatedChanges = mutation.changes

            if (typeof navigator !== 'undefined' && !navigator.onLine) {
              results.push({ ...mutation.original, ...updatedChanges } as TRecord)
              continue
            }

            const value = await retryWithBackoff(() =>
              api[config.apiKey]('update', {
                where: { id: mutation.original.id },
                data: updatedChanges,
              }),
            )

            results.push(value as TRecord)
          }
          return results
        },

        onDelete: async ({ transaction }) => {
          if (typeof navigator !== 'undefined' && !navigator.onLine) return
          const results = []
          for (const mutation of transaction.mutations) {
            const result = await api[config.apiKey]('delete', {
              where: { id: mutation.original.id },
            })
            if (result.isErr()) throw new Error(result.error)
            results.push(result.value)
          }
          return results
        },
      }),
    }),
  ) as unknown as Collection<TRecord>

  if (bc) {
    bc.addEventListener('message', async event => {
      const message = parseDbSyncBroadcastMessage(event.data)
      if (!message || message.apiKey !== config.apiKey) return
      // Ignore same-tab broadcasts to avoid stale refetches racing manual transactions.
      if (message.fromTab === dbSyncTabId) return

      await collection._sync.startSync()
      queryClient.invalidateQueries({ queryKey: [config.apiKey] })
    })

    collection.subscribeChanges(() => {
      bc.postMessage({ apiKey: config.apiKey, fromTab: dbSyncTabId })
    })
  }

  return collection
}
