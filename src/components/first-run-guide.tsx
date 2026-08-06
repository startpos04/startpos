/**
 * first-run-guide.tsx
 *
 * FirstRunGuide — profile-aware "how to start selling" card shown on the
 * dashboard for new businesses that haven't completed their first sale yet.
 *
 * Behaviour:
 *   - Shown when: user.currentProfile is set AND hasOrders === false.
 *   - Auto-dismissed when hasOrders flips to true (first sale detected).
 *   - Manually dismissible via the X button (session-only, uses tutorialStore).
 *   - CHOOSE path renders two side-by-side option cards instead of a step list.
 *
 * Architecture:
 *   - Reads currentProfile and enabledCapabilityIds from authStore.
 *   - Reads hasOrders from useLiveQuery on orderCollection (same source as
 *     useTutorialContext, no extra queries).
 *   - Calls resolveFirstRun() — pure, no IO.
 *   - Dismiss is written to tutorialStore under id 'first-run-guide'.
 */

import { useLiveQuery } from '@tanstack/react-db'
import { Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { ArrowRightIcon, BookOpenIcon, PackageIcon, ShoppingCartIcon, XIcon } from 'lucide-react'
import { useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { orderCollection } from '@/db/collections'
import type { FirstRunConfig } from '@/lib/tutorial/first-run-resolver'
import { resolveFirstRun } from '@/lib/tutorial/first-run-resolver'
import { dismissTutorial, isTutorialDismissed, tutorialStore } from '@/lib/tutorial/tutorial-store'
import { cn } from '@/lib/utils'
import { authStore } from '@/store/auth-store'

const DISMISS_ID = 'first-run-guide'

// ---------------------------------------------------------------------------
// Path icon map
// ---------------------------------------------------------------------------

const PATH_ICONS = {
  QUICK_SELL: ShoppingCartIcon,
  ORDER_FIRST: BookOpenIcon,
  SETUP_FIRST: PackageIcon,
  CHOOSE: BookOpenIcon,
} as const

// ---------------------------------------------------------------------------
// useFirstRun — assembles all data the guide needs, no props required.
// Exported so the dashboard can read isVisible without duplicating logic.
// ---------------------------------------------------------------------------

export function useFirstRun() {
  const user = useStore(authStore, s => s.user)
  const dismissed = useStore(tutorialStore, s => s.dismissed)

  const ordersQuery = useLiveQuery(q => q.from({ o: orderCollection }).select(({ o }) => o))
  const hasOrders = (ordersQuery.data?.length ?? 0) > 0

  // Auto-dismiss once the first sale happens
  useEffect(() => {
    if (hasOrders && !isTutorialDismissed(DISMISS_ID)) {
      dismissTutorial(DISMISS_ID)
    }
  }, [hasOrders])

  const config = resolveFirstRun(
    user?.currentProfile as import('@/lib/onboarding/types').OperationalProfile | null,
    (user?.entitlement?.capabilities ?? []) as string[],
  )

  const isVisible = config !== null && !dismissed.has(DISMISS_ID) && !hasOrders

  return { config, isVisible }
}

// ---------------------------------------------------------------------------
// FirstRunGuide — public export
// ---------------------------------------------------------------------------

export function FirstRunGuide() {
  const { config, isVisible } = useFirstRun()

  if (!isVisible || !config) return null

  if (config.path === 'CHOOSE') {
    return <ChoosePathCard config={config} />
  }

  return <StepListCard config={config} />
}

// ---------------------------------------------------------------------------
// StepListCard — used for QUICK_SELL, ORDER_FIRST, SETUP_FIRST
// ---------------------------------------------------------------------------

function StepListCard({ config }: { config: FirstRunConfig }) {
  const Icon = PATH_ICONS[config.path]

  return (
    <Card className='border-primary/20 bg-linear-to-br from-primary/5 to-background overflow-hidden'>
      <CardHeader className='pb-3 flex flex-row items-start justify-between gap-4'>
        <div className='space-y-1.5'>
          <div className='flex items-center gap-2'>
            <Badge variant='outline' className='text-[10px] font-bold uppercase tracking-wider border-primary/30 text-primary px-2 py-0'>
              {config.profileLabel}
            </Badge>
          </div>
          <h2 className='text-xl font-bold tracking-tight text-foreground leading-snug'>{config.headline}</h2>
          <p className='text-sm text-muted-foreground leading-snug'>{config.subheadline}</p>
        </div>
        <div className='flex items-start gap-2 shrink-0'>
          <div className='w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center'>
            <Icon className='w-4 h-4 text-primary' />
          </div>
          <button
            type='button'
            onClick={() => dismissTutorial(DISMISS_ID)}
            className='text-muted-foreground hover:text-foreground transition-colors mt-0.5'
            aria-label='Dismiss guide'
          >
            <XIcon className='h-4 w-4' />
          </button>
        </div>
      </CardHeader>

      <CardContent className='pt-0 space-y-5'>
        {/* Step list */}
        <ol className='space-y-3'>
          {config.steps.map((step, i) => (
            <li key={step.label} className='flex items-start gap-3'>
              <span
                className={cn(
                  'shrink-0 w-6 h-6 rounded-full flex items-center justify-center',
                  'text-xs font-bold border-2',
                  'border-primary/40 text-primary bg-primary/5',
                )}
              >
                {i + 1}
              </span>
              <div className='pt-0.5'>
                <p className='text-sm font-semibold text-foreground leading-snug'>{step.label}</p>
                <p className='text-xs text-muted-foreground mt-0.5 leading-snug'>{step.description}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* CTA */}
        <Button asChild className='w-full sm:w-auto gap-2 shadow-sm shadow-primary/20'>
          <Link to={config.primaryCta.route}>
            {config.primaryCta.label}
            <ArrowRightIcon className='h-4 w-4' />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// ChoosePathCard — used for GENERAL profile (two options side by side)
// ---------------------------------------------------------------------------

function ChoosePathCard({ config }: { config: FirstRunConfig }) {
  return (
    <Card className='border-primary/20 bg-linear-to-br from-primary/5 to-background overflow-hidden'>
      <CardHeader className='pb-3 flex flex-row items-start justify-between gap-4'>
        <div className='space-y-1.5'>
          <Badge variant='outline' className='text-[10px] font-bold uppercase tracking-wider border-primary/30 text-primary px-2 py-0'>
            {config.profileLabel}
          </Badge>
          <h2 className='text-xl font-bold tracking-tight text-foreground leading-snug'>{config.headline}</h2>
          <p className='text-sm text-muted-foreground leading-snug'>{config.subheadline}</p>
        </div>
        <button
          type='button'
          onClick={() => dismissTutorial(DISMISS_ID)}
          className='text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5'
          aria-label='Dismiss guide'
        >
          <XIcon className='h-4 w-4' />
        </button>
      </CardHeader>

      <CardContent className='pt-0'>
        <div className='grid sm:grid-cols-2 gap-3'>
          {/* Quick-sell option */}
          <Link to={config.primaryCta.route} className='block group'>
            <div
              className={cn(
                'rounded-xl border-2 border-primary/20 bg-primary/5 p-4 h-full',
                'hover:border-primary/50 hover:bg-primary/10 transition-all duration-150',
                'cursor-pointer group-active:scale-[0.99]',
              )}
            >
              <div className='flex items-center gap-2 mb-2'>
                <ShoppingCartIcon className='w-4 h-4 text-primary' />
                <span className='text-sm font-bold text-foreground'>Start selling now</span>
              </div>
              <p className='text-xs text-muted-foreground leading-snug'>
                Add products as you sell them. Your catalog builds itself over time. No setup required.
              </p>
              <div className='flex items-center gap-1 mt-3 text-xs font-semibold text-primary'>
                Go to POS <ArrowRightIcon className='h-3 w-3' />
              </div>
            </div>
          </Link>

          {/* Setup-first option */}
          {config.secondaryCta && (
            <Link to={config.secondaryCta.route} className='block group'>
              <div
                className={cn(
                  'rounded-xl border-2 border-border bg-muted/30 p-4 h-full',
                  'hover:border-primary/30 hover:bg-muted/50 transition-all duration-150',
                  'cursor-pointer group-active:scale-[0.99]',
                )}
              >
                <div className='flex items-center gap-2 mb-2'>
                  <PackageIcon className='w-4 h-4 text-muted-foreground' />
                  <span className='text-sm font-bold text-foreground'>Set up catalog first</span>
                </div>
                <p className='text-xs text-muted-foreground leading-snug'>
                  Create products, add stock levels, then start selling. Better for businesses that need inventory tracking.
                </p>
                <div className='flex items-center gap-1 mt-3 text-xs font-semibold text-muted-foreground'>
                  Add first product <ArrowRightIcon className='h-3 w-3' />
                </div>
              </div>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
