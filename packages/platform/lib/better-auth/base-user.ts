import type { Role } from 'prisma/generated/prisma/enums'
import type { AuthorizationSummary } from './auth-store'

/**
 * BaseUser — the minimum user shape the platform package needs.
 *
 * All apps extend this with their own domain-specific fields.
 * The package (auth-store, auth-engine, local-auth) only depends on this.
 */
export interface BaseUser {
  id: string
  email: string
  name: string | null
  role: Role
  businessId: string
  branchId: string
  authorization?: AuthorizationSummary | null
}
