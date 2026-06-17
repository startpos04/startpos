import { persistedCollectionOptions } from '@tanstack/browser-db-sqlite-persistence'
import { type Collection, createCollection } from '@tanstack/db'
import { z } from 'zod'
import type { ServerUser } from '@/lib/better-auth/auth-server'
import { persistence } from '.'

export type LocalUser = ServerUser & {
  id: string
  email: string
}

const LocalAuthSchema = z.object({
  id: z.string(),
  email: z.email(),
  hashedPassword: z.string(),
  profile: z.object({}) as unknown as z.ZodType<LocalUser>,
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
