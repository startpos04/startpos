/**
 * subscription-banner.tsx
 *
 * SubscriptionBanner — renders a context-aware banner based on the current
 * subscription status. Shown inside the (private) layout so it appears on
 * every authenticated page.
 *
 * Severity levels:
 *   GRACE_PERIOD       → amber warning — "Payment overdue, X days left"
 *   EXPIRED            → red error     — "Subscription expired, operational features blocked"
 *   LONG_TERM_INACTIVE → red error     — "Account inactive, reactivate to continue"
 *   CANCELLED          → red error     — "Subscription cancelled"
 *   SUSPENDED          → red error     — "Account suspended, contact support"
 *   TRIAL (last 7d)    → blue info     — "X days left in your trial"
 *   All others         → null (no banner)
 *
 * The banner is non-dismissable — it stays until the subscription state
 * changes or the user navigates to /billing to resolve it.
 */

import { SubscriptionStatus } from '@platform/lib/entitlement/entitlement-types'
import { cn } from '@platform/lib/utils'
import { Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { AlertTriangleIcon, ClockIcon, XCircleIcon } from 'lucide-react'
import { authStore } from '@/lib/better-auth/auth-store'
import { SubscriptionPolicy } from '@/lib/billing/policies/subscription-policy'

// ---------------------------------------------------------------------------
// Trial warning threshold — show the trial banner in the last N days
// ---------------------------------------------------------------------------
const TRIAL_WARNING_DAYS = 7

// ---------------------------------------------------------------------------
// SubscriptionBanner
// ---------------------------------------------------------------------------

export function SubscriptionBanner() {
  const entitlement = useStore(authStore, state => state.user?.entitlement)

  const status = entitlement?.status
  if (!status) return null

  const now = new Date()

  // --- GRACE_PERIOD ---
  if (status === SubscriptionStatus.GRACE_PERIOD) {
    return (
      <Banner variant='warning' icon={<AlertTriangleIcon className='h-4 w-4 shrink-0' />}>
        <span>
          <strong>Payment overdue.</strong> Your account is in the grace period — operational features are still active. Please{' '}
          <BannerLink to='/business/subscription' variant='warning'>
            update your payment method
          </BannerLink>{' '}
          to avoid service interruption.
        </span>
      </Banner>
    )
  }

  // --- EXPIRED ---
  if (status === SubscriptionStatus.EXPIRED) {
    return (
      <Banner variant='error' icon={<XCircleIcon className='h-4 w-4 shrink-0' />}>
        <span>
          <strong>Subscription expired.</strong> Operational features (POS, orders, inventory) are currently blocked.{' '}
          <BannerLink to='/business/subscription' variant='error'>
            Reactivate your subscription
          </BannerLink>{' '}
          to restore access.
        </span>
      </Banner>
    )
  }

  // --- LONG_TERM_INACTIVE ---
  if (status === SubscriptionStatus.LONG_TERM_INACTIVE) {
    return (
      <Banner variant='error' icon={<XCircleIcon className='h-4 w-4 shrink-0' />}>
        <span>
          <strong>Account inactive.</strong> Your account has been inactive for an extended period. All operational features are blocked.{' '}
          <BannerLink to='/subscription/reactivate' variant='error'>
            Reactivate your account
          </BannerLink>{' '}
          to continue.
        </span>
      </Banner>
    )
  }

  // --- CANCELLED ---
  if (status === SubscriptionStatus.CANCELLED) {
    return (
      <Banner variant='error' icon={<XCircleIcon className='h-4 w-4 shrink-0' />}>
        <span>
          <strong>Subscription cancelled.</strong> Operational features are blocked.{' '}
          <BannerLink to='/business/subscription' variant='error'>
            Reactivate your subscription
          </BannerLink>{' '}
          to restore access.
        </span>
      </Banner>
    )
  }

  // --- SUSPENDED ---
  if (status === SubscriptionStatus.SUSPENDED) {
    return (
      <Banner variant='error' icon={<XCircleIcon className='h-4 w-4 shrink-0' />}>
        <span>
          <strong>Account suspended.</strong> Your account has been suspended by platform administration. Please contact support for assistance.
        </span>
      </Banner>
    )
  }

  // --- TRIAL (last 7 days) ---
  if (status === SubscriptionStatus.TRIAL) {
    const trialEndsAt = entitlement.trialEndsAt ? new Date(entitlement.trialEndsAt) : null
    const daysLeft = SubscriptionPolicy.trialDaysRemaining(trialEndsAt, now)

    const isInWarning = trialEndsAt === null || SubscriptionPolicy.isTrialInWarningWindow(trialEndsAt, TRIAL_WARNING_DAYS, now)
    if (!isInWarning) return null

    const dayLabel = daysLeft === null ? 'your trial' : daysLeft === 0 ? 'today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'}`

    return (
      <Banner variant='info' icon={<ClockIcon className='h-4 w-4 shrink-0' />}>
        <span>
          {daysLeft === 0 ? <strong>Your trial expires today.</strong> : <strong>{dayLabel} left in your trial.</strong>}{' '}
          <BannerLink to='/business/subscription' variant='info'>
            Choose a plan
          </BannerLink>{' '}
          to keep access after your trial ends.
        </span>
      </Banner>
    )
  }

  return null
}

// ---------------------------------------------------------------------------
// Internal sub-components
// ---------------------------------------------------------------------------

type BannerVariant = 'warning' | 'error' | 'info'

const VARIANT_CLASSES: Record<BannerVariant, string> = {
  warning: 'bg-amber-100 border-amber-300 text-amber-900 dark:bg-amber-500/20 dark:border-amber-500/40 dark:text-amber-100',
  error: 'bg-red-100 border-red-300 text-red-900 dark:bg-red-500/20 dark:border-red-500/40 dark:text-red-100',
  info: 'bg-blue-100 border-blue-300 text-blue-900 dark:bg-blue-500/20 dark:border-blue-500/40 dark:text-blue-100',
}

const ICON_CLASSES: Record<BannerVariant, string> = {
  warning: 'text-amber-600 dark:text-amber-400',
  error: 'text-red-600 dark:text-red-400',
  info: 'text-blue-600 dark:text-blue-400',
}

const LINK_CLASSES: Record<BannerVariant, string> = {
  warning: 'font-semibold underline underline-offset-2 text-amber-900 dark:text-amber-300 hover:opacity-80',
  error: 'font-semibold underline underline-offset-2 text-red-900 dark:text-red-300 hover:opacity-80',
  info: 'font-semibold underline underline-offset-2 text-blue-900 dark:text-blue-300 hover:opacity-80',
}

function Banner({ variant, icon, children }: { variant: BannerVariant; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={cn('flex items-center gap-3 border-b px-4 py-2.5 text-sm leading-snug', VARIANT_CLASSES[variant])}>
      <span className={cn('shrink-0 mt-px', ICON_CLASSES[variant])}>{icon}</span>
      <div className='flex-1 min-w-0'>{children}</div>
    </div>
  )
}

function BannerLink({ to, variant, children }: { to: string; variant: BannerVariant; children: React.ReactNode }) {
  return (
    <Link to={to} className={LINK_CLASSES[variant]}>
      {children}
    </Link>
  )
}
