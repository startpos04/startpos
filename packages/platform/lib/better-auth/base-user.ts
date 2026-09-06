import type { Role } from 'prisma/generated/prisma/enums'
import type { EntitlementSummary } from '../entitlement/entitlement-types'
import type { AuthorizationSummary } from './auth-store'

/**
 * BaseUser — the minimum user shape the platform package needs.
 *
 * All apps extend this with their own domain-specific fields.
 * The package (auth-store, auth-engine, local-auth) only depends on this.
 *
 * `businessId` and `branchId` are intentionally optional here.
 * The platform has no business assuming every user is always scoped to a
 * tenant — that is an app-layer constraint.
 *
 * App-layer types (e.g. ServerUser in apps/web) re-declare these as required
 * strings, enforcing the tenant constraint where it actually applies.
 */
export interface BaseUser {
  id: string
  email: string
  name: string
  role: Role
  landingPage: string
  businessId?: string
  branchId?: string
  /** Session entitlement summary — populated at login by EntitlementEngine.buildSummary. */
  entitlement?: EntitlementSummary
  authorization?: AuthorizationSummary | null
}
