/**
 * guidance-banner.tsx
 *
 * GuidanceBanner — shared corner-toast primitive used by both the Tutorial
 * system and the Hint system.
 *
 * Tutorial variant (variant='tutorial'):
 *   - Primary color border, action-oriented.
 *   - Shows title + body + CTA button + X dismiss button.
 *   - Pressing X → session-dismisses the tutorial (TutorialStore).
 *   - Condition resolution removes it automatically on next evaluation.
 *
 * Hint variant (variant='hint'):
 *   - Neutral/muted border, informational.
 *   - Shows title + body only — no CTA, no X button.
 *   - Auto-dismisses after HINT_DISPLAY_SECONDS (managed by useHints).
 *
 * Both variants render in the bottom-right corner of the viewport.
 * Named GuidanceBanner rather than TutorialBanner / HintBanner because this
 * is the platform's shared guidance surface — it will grow beyond just these
 * two systems.
 */

import { Link } from '@tanstack/react-router'
import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TutorialBannerProps {
  variant: 'tutorial'
  title: string
  body: string
  ctaLabel: string
  ctaRoute: string
  onDismiss: () => void
}

interface HintBannerProps {
  variant: 'hint'
  title: string
  body: string
}

export type GuidanceBannerProps = TutorialBannerProps | HintBannerProps

// ---------------------------------------------------------------------------
// GuidanceBanner
// ---------------------------------------------------------------------------

export function GuidanceBanner(props: GuidanceBannerProps) {
  const isTutorial = props.variant === 'tutorial'

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50 w-80 rounded-lg border shadow-lg p-4 animate-in slide-in-from-bottom-4 fade-in-0 duration-300',
        isTutorial ? 'border-primary/40 bg-primary/5 dark:bg-primary/10' : 'border-border bg-card',
      )}
      role={isTutorial ? 'alertdialog' : 'status'}
      aria-live={isTutorial ? 'assertive' : 'polite'}
    >
      {/* Header row */}
      <div className='flex items-start justify-between gap-2'>
        <p className={cn('text-sm font-semibold leading-snug', isTutorial ? 'text-primary' : 'text-foreground')}>{props.title}</p>
        {isTutorial && (
          <button
            type='button'
            onClick={props.onDismiss}
            className='shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5'
            aria-label='Dismiss'
          >
            <XIcon className='h-4 w-4' />
          </button>
        )}
      </div>

      {/* Body */}
      <p className='mt-1 text-sm text-muted-foreground leading-snug'>{props.body}</p>

      {/* CTA — tutorial variant only */}
      {isTutorial && (
        <div className='mt-3'>
          <Button asChild size='sm' className='w-full'>
            <Link to={props.ctaRoute}>{props.ctaLabel}</Link>
          </Button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TutorialBannerList — renders the first active tutorial as a corner banner.
// Accepts the tutorials array from useTutorials() and the dismiss callback.
// Only the first unresolved tutorial is shown at a time.
// ---------------------------------------------------------------------------

interface TutorialBannerListProps {
  tutorials: Array<{
    id: string
    title: string
    body: string
    ctaLabel: string
    ctaRoute: string
  }>
  onDismiss: (id: string) => void
}

export function TutorialBannerList({ tutorials, onDismiss }: TutorialBannerListProps) {
  const first = tutorials[0]
  if (!first) return null

  return (
    <GuidanceBanner
      variant='tutorial'
      title={first.title}
      body={first.body}
      ctaLabel={first.ctaLabel}
      ctaRoute={first.ctaRoute}
      onDismiss={() => onDismiss(first.id)}
    />
  )
}
