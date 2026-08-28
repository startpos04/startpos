/**
 * Audit Entry Types for Permission Management
 */

export interface AuditEntry {
  id: string
  type: 'grant' | 'revoke' | 'reset'
  user: {
    id: string
    name: string | null
    email: string
    role: string
    image: string | null
  }
  permission: {
    id: string
    key: string
    name: string
    description: string | null
    scope: string
    action: string
    resource: string
  }
  actionBy: string | null
  actionAt: Date | null
  reason: string | null
  actorName?: string
}
