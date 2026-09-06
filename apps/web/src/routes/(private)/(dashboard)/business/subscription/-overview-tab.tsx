/**
 * Subscription Overview Tab
 *
 * Displays current subscription status, plan details, usage, and add-ons
 */

import { Badge } from '@platform/components/ui/badge'
import { Button } from '@platform/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@platform/components/ui/card'
import { Progress } from '@platform/components/ui/progress'
import { Separator } from '@platform/components/ui/separator'
import { SubscriptionStatus } from '@platform/lib/entitlement/entitlement-types'
import MountManager from '@platform/lib/mount-manager'
import { cn } from '@platform/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CalendarIcon,
  ClockIcon,
  GitBranchIcon,
  PlusIcon,
  RefreshCwIcon,
  UsersIcon,
  XCircleIcon,
  ZapIcon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { refreshAuthUser, useAuthenticatedUser } from '@/lib/better-auth/auth-store'
import { SubscriptionPolicy } from '@/lib/billing/policies/subscription-policy'
import { SubscriptionStatusVO } from '@/lib/billing/value-objects/subscription-status'
import { type AddonCatalogItem, fetchAddonCatalog } from '@/lib/server-fn/purchase-addon-subscription'
import { AddonDialog, BillingCTAs, formatDate, getStatusBadgeConfig } from './-shared-components'

export function OverviewTab() {
  const user = useAuthenticatedUser()
  const entitlement = user?.entitlement

  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await refreshAuthUser()
      toast.success('Subscription details updated')
    } catch (_error) {
      toast.error('Failed to refresh subscription details')
    } finally {
      setIsRefreshing(false)
    }
  }

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
  const txRemaining = entitlement?.txRemaining

  const isBlocked = SubscriptionStatusVO.isOperationallyBlocked(status)
  const isInWarning = status === SubscriptionStatus.GRACE_PERIOD

  return (
    <div className='h-full overflow-y-auto px-4 py-2'>
      <div className='grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-6 items-start pb-6'>
        {/* Left column - Main content */}
        <div className='flex flex-col gap-4 min-w-0'>
          {/* Status card */}
          <Card className={cn('border', isBlocked && 'border-destructive/40', isInWarning && 'border-amber-300/60')}>
            <CardHeader className='pb-3'>
              <div className='flex flex-wrap items-start justify-between gap-3'>
                <div className='space-y-1'>
                  <CardTitle className='text-lg'>Subscription Status</CardTitle>
                  <CardDescription>Your current plan and subscription period.</CardDescription>
                </div>
                <div className='flex items-center gap-2 shrink-0'>
                  <Button variant='outline' size='sm' onClick={handleRefresh} disabled={isRefreshing} className='h-7 px-2'>
                    <RefreshCwIcon className={cn('h-3 w-3', isRefreshing && 'animate-spin')} />
                  </Button>
                  <Badge variant='outline' className={cn('flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 shrink-0 w-fit', badgeConfig.className)}>
                    {badgeConfig.icon}
                    {badgeConfig.label}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className='space-y-4'>
              {/* Trial countdown */}
              {status === SubscriptionStatus.TRIAL && trialDaysLeft !== null && (
                <div className='space-y-2'>
                  <div className='flex flex-col sm:flex-row sm:items-center justify-between text-sm gap-2'>
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
                <div className='flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-muted-foreground'>
                  <CalendarIcon className='h-4 w-4 shrink-0' />
                  <span>
                    Current billing period ends <span className='font-medium text-foreground'>{formatDate(periodEnd)}</span>
                  </span>
                </div>
              )}

              {/* Cancellation scheduled */}
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

              {/* Fully cancelled */}
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
              </div>

              {/* Upgrade nudge */}
              {(status === SubscriptionStatus.TRIAL || status === SubscriptionStatus.EXPIRED) && (
                <div className='mt-4 flex flex-col sm:flex-row sm:items-center justify-between rounded-lg bg-muted/50 px-4 py-3 gap-3'>
                  <p className='text-sm text-muted-foreground'>
                    {status === SubscriptionStatus.TRIAL
                      ? 'Trial is limited to 100 TX, 1 employee, and 1 branch. Upgrade for full access.'
                      : 'Restore access by choosing a plan.'}
                  </p>
                  <Button size='sm' variant='ghost' className='shrink-0 gap-1 w-fit' asChild>
                    <Link to={'/business/subscription/plans'}>
                      View plans <ArrowRightIcon className='h-3.5 w-3.5' />
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column - Sidebar */}
        <div className='space-y-4 xl:sticky xl:top-0'>
          <SubscriptionSidebar />
          <ActiveAddons />
        </div>
      </div>
    </div>
  )
}

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
// SubscriptionSidebar - Usage and credits information
// ---------------------------------------------------------------------------

function SubscriptionSidebar() {
  const user = useAuthenticatedUser()
  const entitlement = user.entitlement

  const periodEnd = entitlement?.currentPeriodEnd
  const txRemaining = entitlement?.txRemaining
  const isUnlimited = txRemaining === null
  const billingModel = entitlement?.billingModel
  const status = entitlement?.status

  // Derived billing model flags for card visibility
  const isCredits = billingModel === 'PREPAID_CREDITS'
  const isSubscription = billingModel === 'MONTHLY_SUBSCRIPTION' || billingModel === 'YEARLY_SUBSCRIPTION'
  const isHybrid = billingModel === 'HYBRID'

  // Show usage card for subscriptions, hybrid, and TRIAL (even though TRIAL uses PREPAID_CREDITS)
  const showUsageCard = isSubscription || isHybrid || status === SubscriptionStatus.TRIAL || (!isCredits && !billingModel)

  // Only show credits card for actual PREPAID_CREDITS users (not TRIAL)
  const showCreditsCard = (isCredits || isHybrid) && status !== SubscriptionStatus.TRIAL

  return (
    <div className='space-y-4'>
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
          <CardContent className='space-y-3'>
            {isUnlimited ? (
              <>
                <div className='space-y-0.5'>
                  <p className='text-2xl font-bold text-foreground'>Unlimited</p>
                  <p className='text-xs text-muted-foreground'>No transaction cap</p>
                </div>
                <Button size='sm' variant='outline' className='w-full' asChild>
                  <Link to='/transactions'>
                    View history <ArrowRightIcon className='h-3 w-3 ml-1' />
                  </Link>
                </Button>
              </>
            ) : (
              <>
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
                <Button size='sm' variant='outline' className='w-full' asChild>
                  <Link to='/transactions'>
                    View history <ArrowRightIcon className='h-3 w-3 ml-1' />
                  </Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {showCreditsCard && (
        <Card>
          <CardHeader className='pb-2'>
            <div className='flex items-center gap-2'>
              <ZapIcon className='h-4 w-4 text-muted-foreground' />
              <CardTitle className='text-sm font-semibold'>Transaction Quota</CardTitle>
            </div>
            <CardDescription className='text-xs'>Prepaid transactions available</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {entitlement?.creditBalance !== null && entitlement?.creditBalance !== undefined ? (
              <>
                <div className='flex items-end gap-1.5'>
                  <p className={cn('text-2xl font-bold tabular-nums', entitlement.creditBalance === 0 ? 'text-destructive' : 'text-foreground')}>
                    {entitlement.creditBalance.toLocaleString()}
                  </p>
                  <p className='text-xs text-muted-foreground pb-1'>transactions</p>
                </div>
                {entitlement.creditBalance === 0 && <p className='text-xs text-destructive font-medium'>Quota depleted — purchase more to continue.</p>}
                {entitlement.creditBalance > 0 && <p className='text-xs text-muted-foreground'>Available for overflow or prepaid billing</p>}
                <Button size='sm' variant='outline' className='w-full' asChild>
                  <Link to='/business/subscription/credits'>
                    View credit history <ArrowRightIcon className='h-3 w-3 ml-1' />
                  </Link>
                </Button>
              </>
            ) : (
              <p className='text-2xl font-bold text-muted-foreground'>—</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ActiveAddons
// ---------------------------------------------------------------------------

function ActiveAddons() {
  const user = useAuthenticatedUser()
  const entitlement = user.entitlement

  const { data: catalog = [] } = useQuery({
    queryKey: ['addon-catalog'],
    queryFn: () => fetchAddonCatalog(),
    staleTime: 60_000,
  })

  const txAddonTotal = entitlement?.txAddonTotal ?? 0
  const isBasicOrTrial = !entitlement?.capabilities.includes('MANAGE_INVENTORY') || entitlement?.status === 'TRIAL'

  // Determine active state per addon
  function isAddonActive(item: AddonCatalogItem): boolean {
    if (item.addonType === 'TX_RECURRING') return txAddonTotal > 0
    return false
  }

  // Filter: hide employee addon for non-basic/trial plans
  const visibleCatalog = catalog.filter(a => {
    if (a.addonType === 'EMPLOYEE') return isBasicOrTrial
    // Collapse the three TX packages into one row — show tx_1000 as the representative
    if (a.id === 'tx_500' || a.id === 'tx_5000') return false
    return true
  })

  const txRepresentative = catalog.find(a => a.id === 'tx_1000') ?? null

  function getAddonIcon(item: AddonCatalogItem) {
    if (item.addonType === 'BRANCH') return <GitBranchIcon className='h-4 w-4' />
    if (item.addonType === 'EMPLOYEE') return <UsersIcon className='h-4 w-4' />
    if (item.addonType === 'TX_RECURRING') return <ZapIcon className='h-4 w-4' />
    return <PlusIcon className='h-4 w-4' />
  }

  function getDescription(item: AddonCatalogItem): string {
    if (item.addonType === 'TX_RECURRING') {
      return txAddonTotal > 0
        ? `${txAddonTotal.toLocaleString()} extra TX active this period — packages from ₱99/mo.`
        : 'Add extra monthly transactions on top of your plan. From ₱99/mo.'
    }
    if (item.addonType === 'BRANCH') return `Add branches beyond your plan's limit. ${item.displayPrice}${item.priceNote}.`
    if (item.addonType === 'EMPLOYEE') return `Add seats beyond your 1-seat limit. ${item.displayPrice}${item.priceNote}.`
    return item.priceNote ? `${item.displayPrice}${item.priceNote}` : item.displayPrice
  }

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-lg'>Add-ons</CardTitle>
        <CardDescription className='text-xs mt-0.5'>All add-ons are billed monthly and can be cancelled any time.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='space-y-2'>
          {visibleCatalog.map(item => {
            const active = isAddonActive(item)
            // For TX recurring row, open with the representative tx_1000 item
            const openWith = item.addonType === 'TX_RECURRING' ? txRepresentative : item
            return (
              <div key={item.id} className='flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40 gap-4'>
                <div className='flex items-center gap-3 min-w-0'>
                  <span className='text-muted-foreground shrink-0'>{getAddonIcon(item)}</span>
                  <div className='min-w-0'>
                    <p className='text-sm font-medium flex items-center gap-2'>
                      {item.label}
                      {active && (
                        <span className='text-[10px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 px-1.5 py-0.5 rounded-full'>
                          Active
                        </span>
                      )}
                      {!item.configured && (
                        <span className='text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full'>Not configured</span>
                      )}
                    </p>
                    <p className='text-xs text-muted-foreground truncate'>{getDescription(item)}</p>
                  </div>
                </div>
                <div className='flex items-center gap-2 shrink-0'>
                  <span className='text-sm font-medium text-muted-foreground'>
                    {item.displayPrice}
                    {item.priceNote}
                  </span>
                  <Button
                    size='sm'
                    variant='ghost'
                    className='h-7 px-2 text-xs'
                    onClick={() => openWith && MountManager.show(AddonDialog, { addon: openWith })}
                    disabled={!item.configured}
                  >
                    <PlusIcon className='h-3 w-3 mr-1' />
                    {active ? 'Add more' : 'Add'}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
