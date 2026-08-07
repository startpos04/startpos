/**
 * billing/index.tsx
 *
 * /billing — Subscription & Billing Dashboard
 *
 * Displays:
 *   - Current subscription status card (status badge, plan name, period dates)
 *   - Trial countdown or period progress bar
 *   - TX remaining indicator (placeholder — wired to real UsageCounter in Phase 2)
 *   - Upgrade / reactivate CTA depending on status
 *   - Plan comparison using PlanEngine.upgradeOptions (read-only in Phase 1)
 *
 * Architecture compliance:
 *   - No monetary calculations in the component — uses PlanEngine helpers.
 *   - All subscription data read from authStore.entitlement (already assembled server-side).
 *   - MANAGE_BILLING capability check: this page must remain accessible for all statuses.
 */

import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BarChart3Icon,
  CalendarIcon,
  CheckCircle2Icon,
  ClockIcon,
  CodeIcon,
  CreditCardIcon,
  FileTextIcon,
  GitBranchIcon,
  PlusIcon,
  RefreshCwIcon,
  UsersIcon,
  XCircleIcon,
  ZapIcon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { getAuthUser } from '@/lib/better-auth/auth-server'
import { SubscriptionPolicy } from '@/lib/billing/policies/subscription-policy'
import { SubscriptionStatusVO } from '@/lib/billing/value-objects/subscription-status'
import { SubscriptionStatus } from '@/lib/entitlement/entitlement-types'
import { cancelSubscription } from '@/lib/queries/cancel-subscription'
import { createBillingPortalSession } from '@/lib/queries/create-billing-portal-session'
import { cn } from '@/lib/utils'
import { authStore, refreshUser } from '@/store/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/billing/')({
  component: BillingDashboard,
})

// ---------------------------------------------------------------------------
// Status badge config
// ---------------------------------------------------------------------------

type BadgeConfig = {
  label: string
  className: string
  icon: React.ReactNode
}

function getStatusBadgeConfig(status: SubscriptionStatus): BadgeConfig {
  switch (status) {
    case SubscriptionStatus.ACTIVE:
      return {
        label: 'Active',
        className: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300',
        icon: <CheckCircle2Icon className='h-3.5 w-3.5' />,
      }
    case SubscriptionStatus.TRIAL:
      return {
        label: 'Free Trial',
        className: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300',
        icon: <ClockIcon className='h-3.5 w-3.5' />,
      }
    case SubscriptionStatus.GRACE_PERIOD:
      return {
        label: 'Grace Period',
        className: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300',
        icon: <AlertTriangleIcon className='h-3.5 w-3.5' />,
      }
    case SubscriptionStatus.EXPIRED:
      return {
        label: 'Expired',
        className: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300',
        icon: <XCircleIcon className='h-3.5 w-3.5' />,
      }
    case SubscriptionStatus.SUSPENDED:
      return {
        label: 'Suspended',
        className: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300',
        icon: <XCircleIcon className='h-3.5 w-3.5' />,
      }
    case SubscriptionStatus.LONG_TERM_INACTIVE:
      return {
        label: 'Inactive',
        className: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300',
        icon: <XCircleIcon className='h-3.5 w-3.5' />,
      }
    case SubscriptionStatus.CANCELLED:
      return {
        label: 'Cancelled',
        className: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300',
        icon: <XCircleIcon className='h-3.5 w-3.5' />,
      }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// BillingDashboard
// ---------------------------------------------------------------------------

function BillingDashboard() {
  const user = useStore(authStore, state => state.user)
  const entitlement = user?.entitlement

  const status = entitlement?.status ?? SubscriptionStatus.TRIAL
  const badgeConfig = getStatusBadgeConfig(status)
  const now = new Date()

  // Trial countdown
  const trialEndsAt = entitlement?.trialEndsAt ? new Date(entitlement.trialEndsAt) : null
  const trialDaysLeft = SubscriptionPolicy.trialDaysRemaining(trialEndsAt, now)

  // Trial progress (percentage elapsed out of 30-day default)
  const TRIAL_DURATION_DAYS = 30
  const trialElapsed = trialDaysLeft !== null ? TRIAL_DURATION_DAYS - trialDaysLeft : 0
  const trialProgress = Math.min(100, Math.max(0, (trialElapsed / TRIAL_DURATION_DAYS) * 100))

  // Current period end
  const periodEnd = entitlement?.currentPeriodEnd

  // TX remaining — Phase 2: sourced from UsageCounter via entitlement assembly in auth-server
  const txRemaining = entitlement?.txRemaining
  const isUnlimited = txRemaining === null
  const billingModel = entitlement?.billingModel

  // Derived billing model flags for card visibility
  const isCredits = billingModel === 'PREPAID_CREDITS'
  const isSubscription = billingModel === 'MONTHLY_SUBSCRIPTION' || billingModel === 'YEARLY_SUBSCRIPTION'
  const isHybrid = billingModel === 'HYBRID'
  const showUsageCard = isSubscription || isHybrid || (!isCredits && !billingModel)
  const showCreditsCard = isCredits || isHybrid

  const isBlocked = SubscriptionStatusVO.isOperationallyBlocked(status)
  const isInWarning = status === SubscriptionStatus.GRACE_PERIOD

  return (
    <div className='flex flex-col gap-4 px-4'>
      {/* Page header */}
      <div>
        <h1 className='text-2xl font-bold tracking-tight text-foreground'>Billing &amp; Subscription</h1>
        <p className='text-muted-foreground text-sm mt-0.5'>Manage your subscription plan, usage, and billing details.</p>
      </div>

      {/* Two-column layout — left scrolls, right is sticky */}
      <div className='grid grid-cols-[7fr_5fr] gap-6 items-start'>
        {/* ── Left column — scrollable content ── */}
        <div className='flex flex-col gap-4 min-w-0'>
          {/* Status card */}
          <Card className={cn('border', isBlocked && 'border-destructive/40', isInWarning && 'border-amber-300/60')}>
            <CardHeader className='pb-3'>
              <div className='flex items-start justify-between gap-4'>
                <div className='space-y-1'>
                  <CardTitle className='text-lg'>Subscription Status</CardTitle>
                  <CardDescription>Your current plan and subscription period.</CardDescription>
                </div>
                <Badge variant='outline' className={cn('flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 shrink-0', badgeConfig.className)}>
                  {badgeConfig.icon}
                  {badgeConfig.label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className='space-y-4'>
              {/* Trial countdown */}
              {status === SubscriptionStatus.TRIAL && trialDaysLeft !== null && (
                <div className='space-y-2'>
                  <div className='flex items-center justify-between text-sm'>
                    <span className='text-muted-foreground flex items-center gap-1.5'>
                      <ClockIcon className='h-4 w-4' />
                      Trial progress
                    </span>
                    <span className='font-medium text-foreground'>
                      {trialDaysLeft === 0 ? 'Expires today' : `${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} remaining`}
                    </span>
                  </div>
                  <Progress value={trialProgress} className={cn('h-2', trialDaysLeft <= 7 && '[&>div]:bg-amber-500')} />
                  <p className='text-xs text-muted-foreground'>
                    Trial ends on <span className='font-medium text-foreground'>{formatDate(entitlement?.trialEndsAt)}</span>
                  </p>
                </div>
              )}

              {/* Billing period */}
              {status === SubscriptionStatus.ACTIVE && periodEnd && !entitlement?.cancelledAt && (
                <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                  <CalendarIcon className='h-4 w-4 shrink-0' />
                  <span>
                    Current billing period ends <span className='font-medium text-foreground'>{formatDate(periodEnd)}</span>
                  </span>
                </div>
              )}

              {/* Cancellation scheduled — status is still ACTIVE but cancelledAt is set (end-of-period cancel) */}
              {status === SubscriptionStatus.ACTIVE && entitlement?.cancelledAt && (
                <div className='flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800/60 dark:bg-amber-950/20'>
                  <AlertTriangleIcon className='h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5' />
                  <div className='text-sm'>
                    <p className='font-medium text-amber-900 dark:text-amber-300'>Cancellation scheduled</p>
                    <p className='text-amber-800/80 dark:text-amber-400/80 mt-0.5'>
                      Your subscription is active until{' '}
                      <span className='font-medium'>{periodEnd ? formatDate(periodEnd) : 'the end of your billing period'}</span>. After that, access to
                      operational features will be restricted.
                    </p>
                  </div>
                </div>
              )}

              {/* Fully cancelled — status is CANCELLED */}
              {status === SubscriptionStatus.CANCELLED && (
                <div className='flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5'>
                  <XCircleIcon className='h-4 w-4 text-destructive shrink-0 mt-0.5' />
                  <div className='text-sm'>
                    <p className='font-medium text-destructive'>Subscription cancelled</p>
                    <p className='text-muted-foreground mt-0.5'>
                      Operational features are currently restricted. Reactivate your subscription to restore access — you can pick any plan including your
                      previous one.
                    </p>
                  </div>
                </div>
              )}

              <Separator />

              {/* CTA section */}
              <BillingCTAs status={status} isBlocked={isBlocked} cancelledAt={entitlement?.cancelledAt} />
            </CardContent>
          </Card>

          {/* Plan Details */}
          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='text-lg'>Plan Details</CardTitle>
              <CardDescription>Features and limits included in your current subscription.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='space-y-3'>
                <PlanFeatureRow
                  label='Transaction processing'
                  value={txRemaining === null ? 'Unlimited' : `${(txRemaining ?? 0).toLocaleString()} remaining`}
                />
                <PlanFeatureRow label='Point of Sale (POS)' value='Included' />
                <PlanFeatureRow label='Inventory management' value={entitlement?.capabilities.includes('MANAGE_INVENTORY') ? 'Included' : 'Not included'} />
                <PlanFeatureRow label='Sales reports' value='Included' />
                <PlanFeatureRow
                  label='Employee accounts'
                  value={
                    entitlement?.capabilities.includes('MANAGE_EMPLOYEES')
                      ? (() => {
                          const caps = entitlement?.capabilities ?? []
                          const hasInventory = caps.includes('MANAGE_INVENTORY')
                          const hasPurchase = caps.includes('CREATE_PURCHASE')
                          return hasInventory || hasPurchase ? 'Unlimited' : '1 seat'
                        })()
                      : 'Not included'
                  }
                />
                <PlanFeatureRow
                  label='Branch management'
                  value={
                    entitlement?.capabilities.includes('MANAGE_BRANCHES')
                      ? (() => {
                          const caps = entitlement?.capabilities ?? []
                          if (caps.includes('CREATE_PURCHASE')) return 'Up to 5 branches'
                          if (caps.includes('MANAGE_INVENTORY')) return 'Up to 3 branches'
                          return '1 branch'
                        })()
                      : 'Not included'
                  }
                />
                <PlanFeatureRow label='Vendor sessions' value={entitlement?.capabilities.includes('START_VENDOR_SESSION') ? 'Included' : 'Not included'} />
                <PlanFeatureRow label='Supplier management' value={entitlement?.capabilities.includes('MANAGE_SUPPLIERS') ? 'Included' : 'Not included'} />
                <PlanFeatureRow label='Data export' value={entitlement?.capabilities.includes('EXPORT_DATA') ? 'Included' : 'Not included'} />
                <PlanFeatureRow label='Purchase orders' value={entitlement?.capabilities.includes('CREATE_PURCHASE') ? 'Included' : 'Not included'} />
                <PlanFeatureRow label='Task management' value={entitlement?.capabilities.includes('CREATE_TASK') ? 'Included' : 'Not included'} />
                <PlanFeatureRow label='Analytics dashboard' value={entitlement?.capabilities.includes('VIEW_ANALYTICS') ? 'Included' : 'Add-on'} />
                <PlanFeatureRow label='API access' value={entitlement?.capabilities.includes('ACCESS_API') ? 'Included' : 'Add-on'} />
              </div>

              {/* Upgrade nudge */}
              {(status === SubscriptionStatus.TRIAL || status === SubscriptionStatus.EXPIRED) && (
                <div className='mt-4 flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3'>
                  <p className='text-sm text-muted-foreground'>
                    {status === SubscriptionStatus.TRIAL
                      ? 'Trial is limited to 100 TX, 1 employee, and 1 branch. Upgrade for full access.'
                      : 'Restore access by choosing a plan.'}
                  </p>
                  <Button size='sm' variant='ghost' className='shrink-0 gap-1' asChild>
                    <Link to={'/billing/plans'}>
                      View plans <ArrowRightIcon className='h-3.5 w-3.5' />
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Add-ons */}
          <ActiveAddons />
        </div>

        {/* ── Right column — sticky, never scrolls ── */}
        <div className='sticky top-6 flex flex-col gap-4'>
          {/* Usage / Credits */}
          {showUsageCard && (
            <Card>
              <CardHeader className='pb-2'>
                <div className='flex items-center gap-2'>
                  <ZapIcon className='h-4 w-4 text-muted-foreground' />
                  <CardTitle className='text-sm font-semibold'>Usage This Period</CardTitle>
                </div>
                <CardDescription className='text-xs'>{periodEnd ? `Period ends ${formatDate(periodEnd)}` : 'Current billing period'}</CardDescription>
              </CardHeader>
              <CardContent>
                {isUnlimited ? (
                  <div className='space-y-0.5'>
                    <p className='text-2xl font-bold text-foreground'>Unlimited</p>
                    <p className='text-xs text-muted-foreground'>No transaction cap</p>
                  </div>
                ) : (
                  <div className='space-y-1'>
                    <div className='flex items-end justify-between'>
                      <p className={cn('text-2xl font-bold', txRemaining === 0 ? 'text-destructive' : 'text-foreground')}>
                        {txRemaining !== null && txRemaining !== undefined ? txRemaining.toLocaleString() : '—'}
                      </p>
                      <p className='text-xs text-muted-foreground pb-1'>remaining</p>
                    </div>
                    {txRemaining === 0 && <p className='text-xs text-destructive font-medium'>Allowance exhausted — upgrade to continue.</p>}
                    {txRemaining !== null && txRemaining !== undefined && txRemaining > 0 && (
                      <p className='text-xs text-muted-foreground'>Transactions available this period</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {showCreditsCard && (
            <Card>
              <CardHeader className='pb-2'>
                <div className='flex items-center gap-2'>
                  <CreditCardIcon className='h-4 w-4 text-muted-foreground' />
                  <CardTitle className='text-sm font-semibold'>Credits</CardTitle>
                </div>
                <CardDescription className='text-xs'>1 credit = 1 transaction</CardDescription>
              </CardHeader>
              <CardContent className='space-y-3'>
                {entitlement?.creditBalance !== null && entitlement?.creditBalance !== undefined ? (
                  <>
                    <div className='flex items-end gap-1.5'>
                      <p className={cn('text-2xl font-bold tabular-nums', entitlement.creditBalance === 0 ? 'text-destructive' : 'text-foreground')}>
                        {entitlement.creditBalance.toLocaleString()}
                      </p>
                      <p className='text-xs text-muted-foreground pb-1'>remaining</p>
                    </div>
                    {entitlement.creditBalance === 0 && <p className='text-xs text-destructive font-medium'>Depleted — purchase more to continue.</p>}
                    <Button size='sm' variant='outline' className='w-full' asChild>
                      <Link to='/billing/credits'>
                        View history <ArrowRightIcon className='h-3 w-3 ml-1' />
                      </Link>
                    </Button>
                  </>
                ) : (
                  <p className='text-2xl font-bold text-muted-foreground'>—</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Invoices — only for subscription billing */}
          {!showCreditsCard && (
            <Card>
              <CardHeader className='pb-2'>
                <div className='flex items-center gap-2'>
                  <FileTextIcon className='h-4 w-4 text-muted-foreground' />
                  <CardTitle className='text-sm font-semibold'>Invoices</CardTitle>
                </div>
                <CardDescription className='text-xs'>Billing history &amp; payment status</CardDescription>
              </CardHeader>
              <CardContent>
                <Button size='sm' variant='outline' className='w-full' asChild>
                  <Link to='/billing/invoices'>
                    View invoices <ArrowRightIcon className='h-3 w-3 ml-1' />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Quick actions */}
          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-semibold'>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className='flex flex-col gap-2'>
              {status === SubscriptionStatus.CANCELLED ? (
                <Button size='sm' variant='default' className='w-full justify-start' asChild>
                  <Link to={'/billing/plans'}>
                    <RefreshCwIcon className='h-3.5 w-3.5 mr-2' />
                    Reactivate subscription
                  </Link>
                </Button>
              ) : (
                <Button size='sm' variant='outline' className='w-full justify-start' asChild>
                  <Link to={'/billing/plans'}>
                    <CreditCardIcon className='h-3.5 w-3.5 mr-2' />
                    {status === SubscriptionStatus.TRIAL ? 'Upgrade plan' : 'Change plan'}
                  </Link>
                </Button>
              )}
              <Button size='sm' variant='outline' className='w-full justify-start' asChild>
                <Link to={'/billing/pricing'}>
                  <ZapIcon className='h-3.5 w-3.5 mr-2' />
                  Build custom plan
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PlanFeatureRow({ label, value }: { label: string; value: string }) {
  const isAvailable = value !== 'Not included'
  const isAddon = value === 'Add-on'
  return (
    <div className='flex items-center justify-between text-sm'>
      <span className='text-muted-foreground'>{label}</span>
      <span className={cn('font-medium', isAddon ? 'text-amber-600 dark:text-amber-400' : isAvailable ? 'text-foreground' : 'text-muted-foreground/50')}>
        {value}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ActiveAddons
// Shows currently active add-ons and lets the user add new ones.
// Add-on prices read from authStore.systemConfigs (admin-configurable via SystemConfig).
// ---------------------------------------------------------------------------

function ActiveAddons() {
  const user = useStore(authStore, state => state.user)
  const entitlement = user?.entitlement
  const configs = user?.systemConfigs

  const analyticsPrice = configs?.ADDON_ANALYTICS_PRICE ?? 29900
  const apiPrice = configs?.ADDON_API_PRICE ?? 49900
  const branchPrice = configs?.ADDON_BRANCH_PRICE ?? 19900
  const employeePrice = configs?.ADDON_EMPLOYEE_PRICE ?? 4900

  // Derive active add-ons from capabilities in the entitlement summary
  const hasAnalytics = entitlement?.capabilities.includes('VIEW_ANALYTICS') ?? false
  const hasApi = entitlement?.capabilities.includes('ACCESS_API') ?? false
  // Show employee add-on on Basic (1-seat limit) and Trial (also 1-seat limit)
  const isBasicOrTrial = !entitlement?.capabilities.includes('MANAGE_INVENTORY') || entitlement?.status === 'TRIAL'

  function formatPrice(cents: number) {
    return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 0 })}/mo`
  }

  function handleAddAddon(name: string) {
    // TODO: wire to Stripe add-on checkout in Phase B
    toast.info(`"${name}" add-on checkout coming soon.`)
  }

  type AddonDef = {
    key: string
    label: string
    description: string
    price: number
    active: boolean
    icon: React.ReactNode
  }

  const addons: AddonDef[] = [
    {
      key: 'analytics',
      label: 'Analytics Dashboard',
      description: 'Advanced sales trends, staff performance, revenue vs cost.',
      price: analyticsPrice,
      active: hasAnalytics,
      icon: <BarChart3Icon className='h-4 w-4' />,
    },
    {
      key: 'api',
      label: 'API Access',
      description: 'Generate API keys and integrate with your own tools.',
      price: apiPrice,
      active: hasApi,
      icon: <CodeIcon className='h-4 w-4' />,
    },
    {
      key: 'branch',
      label: 'Extra Branch',
      description: `Add more locations beyond your plan's limit. ${formatPrice(branchPrice)} per branch.`,
      price: branchPrice,
      active: false, // always shows as an available add-on — quantity is chosen at checkout
      icon: <GitBranchIcon className='h-4 w-4' />,
    },
    ...(isBasicOrTrial
      ? [
          {
            key: 'employee',
            label: 'Extra Employee',
            description: `Add more seats beyond your 1-seat limit. ${formatPrice(employeePrice)} per employee.`,
            price: employeePrice,
            active: false,
            icon: <UsersIcon className='h-4 w-4' />,
          } as AddonDef,
        ]
      : []),
  ]

  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between'>
          <div>
            <CardTitle className='text-lg'>Add-ons</CardTitle>
            <CardDescription className='text-xs mt-0.5'>Extend your plan with premium features. Billed monthly on top of your plan.</CardDescription>
          </div>
          <Button size='sm' variant='outline' asChild>
            <Link to={'/billing/success'}>
              Browse add-ons <PlusIcon className='h-3.5 w-3.5 ml-1.5' />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className='space-y-2'>
          {addons.map(addon => (
            <div key={addon.key} className='flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40 gap-4'>
              <div className='flex items-center gap-3 min-w-0'>
                <span className='text-muted-foreground shrink-0'>{addon.icon}</span>
                <div className='min-w-0'>
                  <p className='text-sm font-medium flex items-center gap-2'>
                    {addon.label}
                    {addon.active && (
                      <span className='text-[10px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 px-1.5 py-0.5 rounded-full'>
                        Active
                      </span>
                    )}
                  </p>
                  <p className='text-xs text-muted-foreground truncate'>{addon.description}</p>
                </div>
              </div>
              <div className='flex items-center gap-3 shrink-0'>
                <span className='text-sm font-medium text-muted-foreground'>{formatPrice(addon.price)}</span>
                {!addon.active && (
                  <Button size='sm' variant='ghost' className='h-7 px-2 text-xs' onClick={() => handleAddAddon(addon.label)}>
                    <PlusIcon className='h-3 w-3 mr-1' /> Add
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// BillingCTAs — Phase 4
// Renders the appropriate action buttons for the current subscription status.
// Cancel confirmation uses AlertDialog to prevent accidental cancellation.
// ---------------------------------------------------------------------------

function BillingCTAs({ status, isBlocked, cancelledAt }: { status: SubscriptionStatus; isBlocked: boolean; cancelledAt: string | null | undefined }) {
  const [cancelOpen, setCancelOpen] = useState(false)

  const cancelMutation = useMutation({
    mutationFn: () => cancelSubscription({ data: { immediate: false, reason: 'Business-initiated cancellation from billing dashboard.' } }),
    onSuccess: async result => {
      if (!result.success) {
        toast.error('error' in result ? result.error : 'Cancellation failed.')
        return
      }
      setCancelOpen(false)
      // Refresh authStore so the billing page reflects the updated
      // cancelledAt and any status change without a full page reload.
      const freshUser = await getAuthUser()
      if (freshUser) refreshUser(freshUser)

      if (result.immediate) {
        toast.success('Subscription cancelled. Access has been revoked.')
      } else {
        const until = result.accessUntil
          ? new Date(result.accessUntil).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
          : 'end of billing period'
        toast.success(`Cancellation scheduled. You have access until ${until}.`)
      }
    },
    onError: () => toast.error('Something went wrong. Please try again.'),
  })

  return (
    <div className='flex flex-wrap gap-2 pt-1'>
      {/* Upgrade — shown during trial */}
      {status === SubscriptionStatus.TRIAL && (
        <Button size='sm' asChild>
          <Link to={'/billing/plans'}>
            <CreditCardIcon className='h-4 w-4 mr-1.5' />
            Upgrade Plan
          </Link>
        </Button>
      )}

      {/* Invoices link — shown when active */}
      {status === SubscriptionStatus.ACTIVE && (
        <Button size='sm' variant='outline' asChild>
          <Link to={'/billing/invoices'}>
            <FileTextIcon className='h-4 w-4 mr-1.5' />
            View Invoices
          </Link>
        </Button>
      )}

      {/* Cancel subscription — only when ACTIVE and not already scheduled for cancellation */}
      {status === SubscriptionStatus.ACTIVE && !cancelledAt && (
        <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <AlertDialogTrigger asChild>
            <Button size='sm' variant='ghost' className='text-muted-foreground hover:text-destructive'>
              Cancel subscription
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
              <AlertDialogDescription>
                Your access will continue until the end of the current billing period. After that, your account will be moved to EXPIRED status and operational
                features will be restricted. You can reactivate at any time.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep subscription</AlertDialogCancel>
              <AlertDialogAction
                className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? 'Cancelling…' : 'Yes, cancel'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Reactivate — shown when blocked (not long-term inactive) */}
      {isBlocked && status !== SubscriptionStatus.LONG_TERM_INACTIVE && (
        <Button size='sm' asChild>
          <Link to={'/billing/plans'}>
            <RefreshCwIcon className='h-4 w-4 mr-1.5' />
            Reactivate Subscription
          </Link>
        </Button>
      )}

      {/* Long-term inactive — special escape hatch */}
      {status === SubscriptionStatus.LONG_TERM_INACTIVE && (
        <Button size='sm' asChild>
          <Link to='/subscription/reactivate'>
            <RefreshCwIcon className='h-4 w-4 mr-1.5' />
            Reactivate Account
          </Link>
        </Button>
      )}

      {/* Grace period — payment failed. Open Stripe portal to update payment method. */}
      {status === SubscriptionStatus.GRACE_PERIOD && <GracePeriodPortalButton />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// GracePeriodPortalButton
// Opens the Stripe Billing Portal so the user can update their payment method.
// ---------------------------------------------------------------------------
function GracePeriodPortalButton() {
  const portalMutation = useMutation({
    mutationFn: () => createBillingPortalSession({ data: undefined }),
    onSuccess: result => {
      if (!result.success) {
        toast.error('error' in result ? result.error : 'Could not open billing portal.')
        return
      }
      window.location.href = result.url
    },
    onError: () => toast.error('Something went wrong. Please try again.'),
  })

  return (
    <Button size='sm' onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending} className='gap-1.5'>
      <CreditCardIcon className='h-4 w-4' />
      {portalMutation.isPending ? 'Opening…' : 'Update Payment Method'}
    </Button>
  )
}
