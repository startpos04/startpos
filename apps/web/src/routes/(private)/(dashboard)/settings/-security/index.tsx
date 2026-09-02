/**
 * settings/-security/index.tsx
 *
 * Security tab â€” Phase 1 + Phase 2 legal compliance.
 *
 * Shows the last 20 login sessions for the current user:
 *   - IP address
 *   - Browser / device (parsed from userAgent)
 *   - Login timestamp
 *   - Session status (active / expired)
 *   - Revoke button for active sessions (Phase 2)
 */

import { Badge } from '@platform/components/ui/badge'
import { Button } from '@platform/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@platform/components/ui/card'
import { Skeleton } from '@platform/components/ui/skeleton'
import dayjs from '@platform/lib/dayjs'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Monitor, RefreshCw, Shield, Smartphone, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { fetchLoginHistory, type LoginHistoryEntry } from '@/lib/server-fn/fetch-login-history'
import { revokeSession } from '@/lib/server-fn/revoke-session'

// ---------------------------------------------------------------------------
// User-agent parser â€” lightweight, no library needed
// ---------------------------------------------------------------------------

function parseUserAgent(ua: string | null): { label: string; isMobile: boolean } {
  if (!ua) return { label: 'Unknown device', isMobile: false }
  const lower = ua.toLowerCase()
  const isMobile = /mobile|android|iphone|ipad/.test(lower)
  let browser = 'Browser'
  if (lower.includes('edg/')) browser = 'Edge'
  else if (lower.includes('chrome/') && !lower.includes('chromium')) browser = 'Chrome'
  else if (lower.includes('firefox/')) browser = 'Firefox'
  else if (lower.includes('safari/') && !lower.includes('chrome')) browser = 'Safari'
  else if (lower.includes('opr/') || lower.includes('opera/')) browser = 'Opera'
  let os = ''
  if (lower.includes('windows')) os = 'Windows'
  else if (lower.includes('mac os')) os = 'macOS'
  else if (lower.includes('android')) os = 'Android'
  else if (lower.includes('iphone') || lower.includes('ipad')) os = 'iOS'
  else if (lower.includes('linux')) os = 'Linux'
  return { label: os ? `${browser} on ${os}` : browser, isMobile }
}

// ---------------------------------------------------------------------------
// Session row
// ---------------------------------------------------------------------------

function SessionRow({ session, onRevoked }: { session: LoginHistoryEntry; onRevoked: () => void }) {
  const { label, isMobile } = parseUserAgent(session.userAgent)
  const isActive = session.isCurrent
  const [isRevoking, setIsRevoking] = useState(false)

  const handleRevoke = async () => {
    setIsRevoking(true)
    try {
      const result = await revokeSession({ data: { sessionId: session.id } })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Session revoked.')
      onRevoked()
    } catch {
      toast.error('Could not revoke session. Please try again.')
    } finally {
      setIsRevoking(false)
    }
  }

  return (
    <div className='flex items-start justify-between gap-3 py-3 border-b last:border-0'>
      <div className='flex items-start gap-3 min-w-0'>
        <div className={`mt-0.5 rounded-lg p-2 shrink-0 ${isActive ? 'bg-primary/10' : 'bg-muted'}`}>
          {isMobile ? (
            <Smartphone className={`size-4 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
          ) : (
            <Monitor className={`size-4 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
          )}
        </div>
        <div className='space-y-0.5 min-w-0'>
          <div className='flex items-center gap-2 flex-wrap'>
            <span className='text-sm font-medium'>{label}</span>
            {isActive && (
              <Badge variant='outline' className='text-xs text-green-600 border-green-200 bg-green-50 dark:bg-green-950/30 py-0 h-4'>
                Active
              </Badge>
            )}
          </div>
          <p className='text-xs text-muted-foreground'>
            {session.ipAddress ?? 'IP unknown'} Â· {dayjs(session.createdAt).format('MMM D, YYYY [at] h:mm A')}
          </p>
          <p className='text-xs text-muted-foreground'>
            {isActive ? `Expires ${dayjs(session.expiresAt).fromNow()}` : `Expired ${dayjs(session.expiresAt).fromNow()}`}
          </p>
        </div>
      </div>

      {/* Only show revoke for active sessions */}
      {isActive && (
        <Button
          variant='ghost'
          size='sm'
          className='h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10'
          onClick={handleRevoke}
          disabled={isRevoking}
          aria-label='Revoke session'
          title='Revoke this session'
        >
          {isRevoking ? <Loader2 className='size-3.5 animate-spin' /> : <X className='size-3.5' />}
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Security page
// ---------------------------------------------------------------------------

export function SecurityPage() {
  const qc = useQueryClient()
  const {
    data: sessions,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['login-history'],
    queryFn: () => fetchLoginHistory(),
    staleTime: 30_000,
  })

  const handleRevoked = () => qc.invalidateQueries({ queryKey: ['login-history'] })

  const activeSessions = sessions?.filter(s => s.isCurrent) ?? []
  const pastSessions = sessions?.filter(s => !s.isCurrent) ?? []

  return (
    <div className='px-4 py-4 space-y-4 max-w-2xl'>
      <div className='flex items-start justify-between'>
        <div>
          <h2 className='text-base font-semibold'>Security</h2>
          <p className='text-xs text-muted-foreground mt-0.5'>Your recent login activity. Review for any sessions you don't recognise.</p>
        </div>
        <Button variant='ghost' size='sm' className='text-xs gap-1' onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`size-3 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className='space-y-3'>
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className='h-20 w-full rounded-xl' />
          ))}
        </div>
      ) : (
        <div className='space-y-4'>
          {/* Active sessions */}
          {activeSessions.length > 0 && (
            <Card>
              <CardHeader className='pb-2 pt-3 px-4'>
                <CardTitle className='text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5'>
                  <Shield className='size-3.5' />
                  Active Sessions
                  <span className='text-muted-foreground/50 font-normal normal-case tracking-normal'>â€” click Ã— to revoke</span>
                </CardTitle>
              </CardHeader>
              <CardContent className='px-4 pt-0 pb-1'>
                {activeSessions.map(s => (
                  <SessionRow key={s.id} session={s} onRevoked={handleRevoked} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Past sessions */}
          {pastSessions.length > 0 && (
            <Card>
              <CardHeader className='pb-2 pt-3 px-4'>
                <CardTitle className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Recent Login History</CardTitle>
              </CardHeader>
              <CardContent className='px-4 pt-0 pb-1'>
                {pastSessions.map(s => (
                  <SessionRow key={s.id} session={s} onRevoked={handleRevoked} />
                ))}
              </CardContent>
            </Card>
          )}

          {(!sessions || sessions.length === 0) && <p className='text-sm text-muted-foreground text-center py-8'>No session history found.</p>}
        </div>
      )}
    </div>
  )
}
