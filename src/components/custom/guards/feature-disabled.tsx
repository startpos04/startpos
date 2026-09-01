/**
 * feature-disabled.tsx
 *
 * FeatureDisabled — full-page placeholder rendered when an operational route
 * is accessed while the subscription is in a blocked state (EXPIRED,
 * LONG_TERM_INACTIVE, SUSPENDED, CANCELLED).
 *
 * Management features (billing, reports, settings) remain accessible;
 * only operational routes need this guard.
 *
 * Usage (in any operational route component):
 *   const gate = useSubscriptionGate()
 *   if (gate) return gate
 *   return <YourRouteComponent />
 *
 * Or directly:
 *   const user = useStore(authStore, state => state.user)
 *   const status = user?.entitlement?.status
 *   if (isOperationallyBlocked(status)) return <FeatureDisabled status={status} />
 */

import { useStore } from '@tanstack/react-store'
import { LockIcon, XCircleIcon } from 'lucide-react'
import type React from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { isOperationallyBlocked, SubscriptionStatusVO } from '@/lib/billing/value-objects/subscription-status'
import { SubscriptionStatus } from '@/lib/entitlement/entitlement-types'
import { authStore } from '@/lib/better-auth/auth-store'

// ---------------------------------------------------------------------------
// FeatureDisabledProps
// ---------------------------------------------------------------------------

type FeatureDisabledProps = {
  /** The current subscription status that triggered the block */
  status: SubscriptionStatus
  /** Optional override for the page title (defaults to status-based message) */
  title?: string
  /** Optional override for the description */
  description?: string
}

// ---------------------------------------------------------------------------
// Copy per status
// ---------------------------------------------------------------------------

type BlockedCopy = {
  title: string
  description: string
  ctaLabel: string
  ctaHref: string
}

function getCopy(status: SubscriptionStatus): BlockedCopy {
  switch (status) {
    case SubscriptionStatus.EXPIRED:
      return {
        title: 'Subscription Expired',
        description: 'Your subscription has expired. Upgrade or reactivate your plan to continue processing transactions and accessing operational features.',
        ctaLabel: 'Reactivate Subscription',
        ctaHref: '/billing',
      }
    case SubscriptionStatus.LONG_TERM_INACTIVE:
      return {
        title: 'Account Inactive',
        description: 'Your account has been inactive for an extended period. Reactivate to restore full access to all operational features.',
        ctaLabel: 'Reactivate Account',
        ctaHref: '/subscription/reactivate',
      }
    case SubscriptionStatus.SUSPENDED:
      return {
        title: 'Account Suspended',
        description: 'Your account has been suspended by platform administration. Please contact support to resolve the issue and restore access.',
        ctaLabel: 'Contact Support',
        ctaHref: '/billing',
      }
    case SubscriptionStatus.CANCELLED:
      return {
        title: 'Subscription Cancelled',
        description: 'Your subscription has been cancelled. Choose a plan to restore access to your POS, inventory, and other operational features.',
        ctaLabel: 'Choose a Plan',
        ctaHref: '/billing',
      }
    default:
      return {
        title: 'Feature Unavailable',
        description: 'This feature is not available with your current subscription. Please upgrade your plan to access it.',
        ctaLabel: 'View Plans',
        ctaHref: '/billing',
      }
  }
}

// ---------------------------------------------------------------------------
// FeatureDisabled
// ---------------------------------------------------------------------------

export function FeatureDisabled({ status, title, description }: FeatureDisabledProps) {
  const copy = getCopy(status)
  const displayTitle = title ?? copy.title
  const displayDescription = description ?? copy.description

  return (
    <div className='w-full h-full flex items-center justify-center p-8 min-h-100'>
      <Card className='max-w-md w-full border-border shadow-sm'>
        <CardHeader className='text-center pb-2'>
          <div className='mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10'>
            {status === SubscriptionStatus.SUSPENDED ? <LockIcon className='h-7 w-7 text-destructive' /> : <XCircleIcon className='h-7 w-7 text-destructive' />}
          </div>
          <CardTitle className='text-xl font-bold tracking-tight'>{displayTitle}</CardTitle>
        </CardHeader>
        <CardContent className='text-center space-y-4'>
          <p className='text-sm text-muted-foreground leading-relaxed'>{displayDescription}</p>
          <div className='flex flex-col gap-2'>
            <Button asChild size='sm'>
              <a href={copy.ctaHref}>{copy.ctaLabel}</a>
            </Button>
            <p className='text-xs text-muted-foreground'>
              Current status: <span className='font-medium text-foreground'>{SubscriptionStatusVO.toLabel(status)}</span>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// useSubscriptionGate
// Convenience hook — returns a FeatureDisabled element if the subscription
// is operationally blocked, or null if access should proceed.
//
// Usage:
//   const gate = useSubscriptionGate()
//   if (gate) return gate
//   return <YourRouteComponent />
// ---------------------------------------------------------------------------

export function useSubscriptionGate(): React.ReactElement | null {
  const status = useStore(authStore, state => state.user?.entitlement?.status) as SubscriptionStatus | undefined

  if (!status) return null
  if (isOperationallyBlocked(status)) {
    return <FeatureDisabled status={status} />
  }
  return null
}
