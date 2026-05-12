import { persistedCollectionOptions } from '@tanstack/browser-db-sqlite-persistence'
import { type Collection, createCollection } from '@tanstack/db'
import { z } from 'zod'
import { persistence } from '.'

export const LocalAuthSchema = z.object({
  id: z.string(),
  email: z.email(),
  hashedPassword: z.string(),
  profile: z.any(),
  expiresAt: z.number(),
})

export type LocalAuth = z.infer<typeof LocalAuthSchema>

export let localAuthCollection = {} as Collection<LocalAuth, string>
if (typeof window !== 'undefined') {
  localAuthCollection = createCollection(
    persistedCollectionOptions<LocalAuth, string>({
      id: `localAuth`,
      getKey: auth => auth.id,
      persistence,
      schemaVersion: 1,
    }),
  )
}
