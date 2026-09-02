import { persistedCollectionOptions } from '@tanstack/browser-db-sqlite-persistence'
import { type Collection, createCollection } from '@tanstack/db'
import { z } from 'zod'
import type { BaseUser } from '../lib/better-auth/base-user'
import { persistence } from '.'

// LocalUser is BaseUser extended with any additional cached fields.
// The profile field holds the full app user object (e.g. ServerUser from apps/web).
export type LocalUser = BaseUser & {
  /** App-specific fields stored alongside the base session data */
  localOverrides?: Array<{
    id: string
    name: string | null
    email: string
    role: string
    accounts?: Array<{ password: string }>
  }>
  [key: string]: unknown
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
