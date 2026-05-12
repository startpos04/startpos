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
import type { QueryClient } from '@tanstack/react-query'
import utc from 'dayjs/plugin/utc'
import dayjs from '@/lib/dayjs'
import { crudAPI } from '@/lib/prisma-client/crud-api'

dayjs.extend(utc)

const api = crudAPI as any

export let localDB = null as unknown as BrowserWASQLiteDatabase
export let persistence = null as unknown as PersistedCollectionPersistence

if (typeof window !== 'undefined') {
  localDB = await openBrowserWASQLiteOPFSDatabase({
    databaseName: `pos_offline_storage.sqlite`,
  })

  persistence = createBrowserWASQLitePersistence({
    database: localDB,
  })
}

const bc = typeof window !== 'undefined' ? new BroadcastChannel('db_sync') : null

interface SyncableRecord {
  id: string
}

interface CreateSyncableCollectionConfigs {
  id: string
  syncMode: SyncMode
  schemaVersion: number
  apiKey: keyof typeof crudAPI
  queryClient: QueryClient
}

/**
 * @template TRecord - The full schema ModelSchema
 */
export function createSyncableCollection<TRecord extends SyncableRecord>(config: CreateSyncableCollectionConfigs): Collection<TRecord> {
  if (typeof window === 'undefined') return {} as Collection<TRecord>

  const collection = createCollection(
    persistedCollectionOptions({
      id: config.id,
      persistence,
      schemaVersion: config.schemaVersion,
      autoIndex: 'eager',
      defaultIndexType: BasicIndex,
      ...queryCollectionOptions({
        queryClient: config.queryClient,
        queryKey: [config.id],
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
            // skip: ctx.meta?.skip ?? 0, // If you eventually pass skip through ctx.meta
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

            const result = await api[config.apiKey]('create', {
              data: input,
            })

            if (result.isErr()) throw new Error(result.error)
            results.push(result.value)
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

            const result = await api[config.apiKey]('update', {
              where: { id: mutation.original.id },
              data: updatedChanges,
            })

            if (result.isErr()) throw new Error(result.error)
            results.push(result.value)
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
      if (event.data === config.id) {
        await collection._sync.startSync()
        config.queryClient.invalidateQueries({ queryKey: [config.id] })
      }
    })

    collection.subscribeChanges(() => {
      bc.postMessage(config.id)
    })
  }

  return collection
}
