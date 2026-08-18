/**
 * settings/capabilities — Capability lifecycle management page (Phase 3a UI)
 *
 * Shows all capabilities grouped by category.
 * For each capability:
 *   ENABLED/CONFIGURED  — state badge + [Pause] button
 *   RECOMMENDED         — state badge + [Enable] [Dismiss] buttons + reason
 *   PAUSED              — state badge + [Restore] button
 *   HIDDEN              — visible only when "Show hidden" is toggled
 *
 * Data: fetched via fetchCapabilityStates server function on mount.
 * Mutations: acceptCapability / enableCapability / pauseCapability /
 *            restoreCapability / dismissCapability — all server functions.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ChevronDown, ChevronUp, Clock, Eye, EyeOff, Pause, Play, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { acceptCapability, dismissCapability, enableCapability, pauseCapability, restoreCapability } from '@/lib/server-fn/capability-actions'
import { type CapabilityStateRow, fetchCapabilityStates } from '@/lib/server-fn/fetch-capability-states'
import { cn } from '@/lib/utils'
import { refreshAuthUser } from '@/store/auth-store'

// ---------------------------------------------------------------------------
// Category display labels + order
// ---------------------------------------------------------------------------

const CATEGORY_ORDER = ['SALES', 'INVENTORY', 'PROCUREMENT', 'FINANCE', 'OPERATIONS', 'CRM', 'COMPLIANCE', 'MULTI_BRANCH', 'REPORTING', 'PLATFORM'] as const
const CATEGORY_LABELS: Record<string, string> = {
  SALES: 'Sales',
  INVENTORY: 'Inventory',
  PROCUREMENT: 'Procurement',
  FINANCE: 'Finance',
  OPERATIONS: 'Operations',
  CRM: 'Customers',
  COMPLIANCE: 'Compliance',
  MULTI_BRANCH: 'Multi-branch',
  REPORTING: 'Reports',
  PLATFORM: 'Platform',
}

// ---------------------------------------------------------------------------
// State badge
// ---------------------------------------------------------------------------

function StateBadge({ state }: { state: string }) {
  const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }> = {
    ENABLED: { label: 'Enabled', variant: 'default', className: 'bg-green-600 hover:bg-green-600 text-white' },
    CONFIGURED: { label: 'Active', variant: 'default', className: 'bg-green-700 hover:bg-green-700 text-white' },
    RECOMMENDED: { label: 'Recommended', variant: 'secondary', className: 'bg-primary/10 text-primary border-primary/20' },
    PAUSED: { label: 'Paused', variant: 'outline' },
    HIDDEN: { label: 'Hidden', variant: 'outline', className: 'text-muted-foreground' },
    DEPRECATED: { label: 'Deprecated', variant: 'destructive' },
  }
  const c = config[state] ?? { label: state, variant: 'outline' as const }
  return (
    <Badge variant={c.variant} className={cn('text-xs', c.className)}>
      {c.label}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Capability row
// ---------------------------------------------------------------------------

function CapabilityRow({ cap, onAction }: { cap: CapabilityStateRow; onAction: () => void }) {
  const [loading, setLoading] = useState(false)
  const [showWhy, setShowWhy] = useState(false)

  const run = async (fn: () => Promise<{ ok: boolean; reason?: string }>) => {
    setLoading(true)
    try {
      const result = await fn()
      if (!result.ok) {
        toast.error(result.reason ?? 'Action failed')
      } else {
        onAction()
        // Refresh authStore so useCapability() hooks across the app update
        // immediately without a page reload — sidebar links, POS gates, etc.
        await refreshAuthUser()
      }
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='flex items-start justify-between gap-4 py-3 border-b last:border-0'>
      <div className='flex-1 min-w-0'>
        <div className='flex items-center gap-2 flex-wrap'>
          <span className='text-sm font-medium'>{cap.label}</span>
          <StateBadge state={cap.state} />
          {cap.estimatedSetupMinutes > 0 && cap.state !== 'ENABLED' && cap.state !== 'CONFIGURED' && (
            <span className='text-xs text-muted-foreground flex items-center gap-0.5'>
              <Clock className='size-3' />
              {cap.estimatedSetupMinutes} min to set up
            </span>
          )}
        </div>
        <p className='text-xs text-muted-foreground mt-0.5 line-clamp-2'>{cap.businessValue}</p>

        {/* "Why is this shown?" — only for RECOMMENDED */}
        {cap.state === 'RECOMMENDED' && cap.recommendationReason && (
          <div className='mt-1'>
            <button type='button' onClick={() => setShowWhy(v => !v)} className='text-xs text-primary flex items-center gap-0.5 hover:underline'>
              Why is this shown?
              {showWhy ? <ChevronUp className='size-3' /> : <ChevronDown className='size-3' />}
            </button>
            {showWhy && <p className='text-xs text-muted-foreground mt-1 bg-muted/40 rounded px-2 py-1'>{cap.recommendationReason}</p>}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className='flex items-center gap-1.5 shrink-0'>
        {cap.state === 'RECOMMENDED' && (
          <>
            <Button
              size='sm'
              variant='default'
              className='h-7 text-xs'
              disabled={loading}
              onClick={() => run(() => acceptCapability({ data: { capabilityId: cap.capabilityId } }))}
            >
              <Play className='size-3 mr-1' />
              Enable
            </Button>
            <Button
              size='sm'
              variant='ghost'
              className='h-7 text-xs text-muted-foreground'
              disabled={loading}
              onClick={() => run(() => dismissCapability({ data: { capabilityId: cap.capabilityId } }))}
            >
              <X className='size-3 mr-1' />
              Dismiss
            </Button>
          </>
        )}
        {(cap.state === 'ENABLED' || cap.state === 'CONFIGURED') && cap.canBePaused && (
          <Button
            size='sm'
            variant='outline'
            className='h-7 text-xs'
            disabled={loading}
            onClick={() => run(() => pauseCapability({ data: { capabilityId: cap.capabilityId } }))}
          >
            <Pause className='size-3 mr-1' />
            Pause
          </Button>
        )}
        {cap.state === 'HIDDEN' && (
          <Button
            size='sm'
            variant='outline'
            className='h-7 text-xs'
            disabled={loading}
            onClick={() => run(() => enableCapability({ data: { capabilityId: cap.capabilityId } }))}
          >
            <Play className='size-3 mr-1' />
            Enable
          </Button>
        )}
        {cap.state === 'PAUSED' && (
          <Button
            size='sm'
            variant='outline'
            className='h-7 text-xs'
            disabled={loading}
            onClick={() => run(() => restoreCapability({ data: { capabilityId: cap.capabilityId } }))}
          >
            <RefreshCw className='size-3 mr-1' />
            Restore
          </Button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function CapabilitiesPage() {
  const qc = useQueryClient()
  const [showHidden, setShowHidden] = useState(false)

  const { data: capabilities, isLoading } = useQuery({
    queryKey: ['capability-states'],
    queryFn: () => fetchCapabilityStates(),
  })

  const refresh = () => void qc.invalidateQueries({ queryKey: ['capability-states'] })

  if (isLoading) {
    return (
      <div className='px-4 py-6 space-y-3'>
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className='h-16 w-full' />
        ))}
      </div>
    )
  }

  const caps = capabilities ?? []

  // Group by category, preserve CATEGORY_ORDER
  const grouped = CATEGORY_ORDER.map(cat => ({
    category: cat,
    label: CATEGORY_LABELS[cat] ?? cat,
    items: caps.filter(c => c.category === cat && (showHidden || c.state !== 'HIDDEN')),
  })).filter(g => g.items.length > 0)

  const hiddenCount = caps.filter(c => c.state === 'HIDDEN').length

  // Summary counts
  const recommendedCount = caps.filter(c => c.state === 'RECOMMENDED').length

  return (
    <div className='px-4 py-4 space-y-4'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-base font-semibold'>Capabilities</h2>
          <p className='text-xs text-muted-foreground mt-0.5'>
            Manage which features are active for your business.
            {recommendedCount > 0 && (
              <span className='text-primary ml-1'>
                {recommendedCount} recommendation{recommendedCount !== 1 ? 's' : ''} available.
              </span>
            )}
          </p>
        </div>
        {hiddenCount > 0 && (
          <Button variant='ghost' size='sm' className='text-xs' onClick={() => setShowHidden(v => !v)}>
            {showHidden ? <EyeOff className='size-3 mr-1' /> : <Eye className='size-3 mr-1' />}
            {showHidden ? 'Hide hidden' : `Show ${hiddenCount} hidden`}
          </Button>
        )}
      </div>

      {/* All-done state */}
      {caps.length === 0 && (
        <Card>
          <CardContent className='py-8 text-center text-sm text-muted-foreground'>
            <CheckCircle2 className='size-8 mx-auto mb-2 text-green-500' />
            All capabilities are configured for your business.
          </CardContent>
        </Card>
      )}

      {/* Capability groups */}
      {grouped.map(({ category, label, items }) => (
        <Card key={category}>
          <CardHeader className='pb-2 pt-3 px-4'>
            <CardTitle className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>{label}</CardTitle>
          </CardHeader>
          <CardContent className='px-4 pt-0 pb-1'>
            {items.map(cap => (
              <CapabilityRow key={cap.capabilityId} cap={cap} onAction={refresh} />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
