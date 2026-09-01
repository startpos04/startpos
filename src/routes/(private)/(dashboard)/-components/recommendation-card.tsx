/**
 * recommendation-card.tsx — Inline recommendation card (Phase 3b UI)
 *
 * Renders a single capability recommendation with:
 *   - Business value text
 *   - Estimated setup time
 *   - Why it's shown (reason from RecommendationEngine)
 *   - "Enable now" button (accept) + "Not right now" button (dismiss)
 *
 * Placement is determined by the parent based on importance:
 *   critical / high  → Dashboard card section
 *   medium           → Contextual (relevant page)
 *   low              → Settings → Capabilities only (not rendered here)
 *
 * @param capabilityId  - The capability to act on
 * @param label         - Human-readable name
 * @param businessValue - "What you'll gain" copy
 * @param reason        - Why this is shown (from RecommendationEngine)
 * @param estimatedSetupMinutes - Setup effort hint
 * @param isComplex     - Shows a "complex setup" warning when true
 * @param onDone        - Called after successful accept or dismiss so parent can refresh
 */

import { Clock, Loader2, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@startpos-core/components/ui/button'
import { Card, CardContent, CardFooter } from '@startpos-core/components/ui/card'
import { acceptCapability, dismissCapability } from '@/lib/server-fn/capability-actions'
import { cn } from '@startpos-core/lib/utils'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RecommendationCardProps {
  capabilityId: string
  label: string
  businessValue: string
  reason: string
  estimatedSetupMinutes: number
  isComplex?: boolean
  onDone?: () => void
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecommendationCard({
  capabilityId,
  label,
  businessValue,
  reason,
  estimatedSetupMinutes,
  isComplex = false,
  onDone,
  className,
}: RecommendationCardProps) {
  const [loadingAccept, setLoadingAccept] = useState(false)
  const [loadingDismiss, setLoadingDismiss] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const handleAccept = async () => {
    setLoadingAccept(true)
    try {
      const result = await acceptCapability({ data: { capabilityId } })
      if (!result.ok) {
        toast.error(result.reason ?? 'Could not enable capability')
      } else {
        toast.success(`${label} has been enabled`)
        onDone?.()
      }
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoadingAccept(false)
    }
  }

  const handleDismiss = async () => {
    setLoadingDismiss(true)
    try {
      const result = await dismissCapability({ data: { capabilityId } })
      if (!result.ok) {
        toast.error(result.reason ?? 'Could not dismiss')
      } else {
        setDismissed(true)
        onDone?.()
      }
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoadingDismiss(false)
    }
  }

  if (dismissed) return null

  return (
    <Card className={cn('border-primary/30 bg-primary/3', className)}>
      <CardContent className='pt-4 pb-2'>
        {/* Header */}
        <div className='flex items-start gap-2'>
          <Sparkles className='size-4 text-primary shrink-0 mt-0.5' />
          <div className='flex-1 min-w-0'>
            <p className='text-sm font-semibold'>{label}</p>
            <p className='text-xs text-muted-foreground mt-0.5'>{businessValue}</p>
          </div>
        </div>

        {/* Why shown */}
        <p className='text-xs text-muted-foreground mt-2 pl-6 italic'>{reason}</p>

        {/* Setup time + complexity */}
        <div className='flex items-center gap-3 mt-2 pl-6'>
          {estimatedSetupMinutes > 0 && (
            <span className='text-xs text-muted-foreground flex items-center gap-1'>
              <Clock className='size-3' />
              {estimatedSetupMinutes < 60 ? `${estimatedSetupMinutes} min setup` : `${Math.round(estimatedSetupMinutes / 60)}h setup`}
            </span>
          )}
          {isComplex && <span className='text-xs text-amber-600 bg-amber-50 dark:bg-amber-950 px-1.5 py-0.5 rounded'>Needs configuration</span>}
        </div>
      </CardContent>

      <CardFooter className='px-4 pb-3 pt-1 flex gap-2'>
        <Button size='sm' className='flex-1 h-7 text-xs' onClick={handleAccept} disabled={loadingAccept || loadingDismiss}>
          {loadingAccept ? <Loader2 className='size-3 mr-1 animate-spin' /> : null}
          Enable now
        </Button>
        <Button size='sm' variant='ghost' className='h-7 text-xs text-muted-foreground' onClick={handleDismiss} disabled={loadingAccept || loadingDismiss}>
          {loadingDismiss ? <Loader2 className='size-3 mr-1 animate-spin' /> : <X className='size-3 mr-1' />}
          Not right now
        </Button>
      </CardFooter>
    </Card>
  )
}
