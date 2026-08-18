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

import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CalendarIcon,
  CheckCircle2Icon,
  ClockIcon,
  CreditCardIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GitBranchIcon,
  MailIcon,
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { getAuthUser } from '@/lib/better-auth/auth-server'
import { SubscriptionPolicy } from '@/lib/billing/policies/subscription-policy'
import { SubscriptionStatusVO } from '@/lib/billing/value-objects/subscription-status'
import { SubscriptionStatus } from '@/lib/entitlement/entitlement-types'
import { cancelSubscription } from '@/lib/server-fn/cancel-subscription'
import { createBillingPortalSession } from '@/lib/server-fn/create-billing-portal-session'
import { type AddonCatalogItem, fetchAddonCatalog, purchaseAddonSubscription } from '@/lib/server-fn/purchase-addon-subscription'
import { fetchTxAddonPackages } from '@/lib/server-fn/purchase-tx-addon'
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
// AddonDialog
// Unified dialog for purchasing any monthly addon subscription via Stripe.
// For per-unit addons (Branch, Employee) shows a quantity selector.
// For TX recurring addons shows three fixed package options.
// For capability addons shows a single confirm-and-redirect.
// ---------------------------------------------------------------------------

function AddonDialog({ addon, open, onClose }: { addon: AddonCatalogItem | null; open: boolean; onClose: () => void }) {
  const [quantity, setQuantity] = useState(1)
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null)

  const { data: txPackages = [], isLoading: loadingTx } = useQuery({
    queryKey: ['tx-addon-packages'],
    queryFn: () => fetchTxAddonPackages(),
    enabled: open && (addon?.id === 'tx_500' || addon?.id === 'tx_1000' || addon?.id === 'tx_5000'),
    staleTime: 60_000,
  })

  const mutation = useMutation({
    mutationFn: async () => {
      if (!addon) throw new Error('No addon selected')
      const isTxRecurring = addon.addonType === 'TX_RECURRING'
      const addonId = isTxRecurring ? (selectedTxId ?? addon.id) : addon.id
      const result = await purchaseAddonSubscription({
        data: { addonId: addonId as Parameters<typeof purchaseAddonSubscription>[0]['data']['addonId'], quantity },
      })
      if (!result.success) throw new Error(result.error)
      return result
    },
    onSuccess: result => {
      window.location.href = result.checkoutUrl
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleClose = () => {
    if (mutation.isPending) return
    setQuantity(1)
    setSelectedTxId(null)
    onClose()
  }

  if (!addon) return null

  const isTxGroup = addon.addonType === 'TX_RECURRING'
  const isPerUnit = addon.perUnit
  const canProceed = isTxGroup ? !!selectedTxId : true

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Add {addon.label}</DialogTitle>
          <DialogDescription>
            {isPerUnit
              ? `Billed monthly per unit. Each unit adds one extra ${addon.id === 'branch' ? 'branch' : 'employee seat'}.`
              : isTxGroup
                ? 'Choose a monthly TX package. Auto-renews each billing period.'
                : `${addon.label} billed at ${addon.displayPrice}${addon.priceNote}. Auto-renews monthly.`}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-3 py-2'>
          {/* Per-unit quantity selector */}
          {isPerUnit && (
            <div className='flex items-center justify-between rounded-lg border px-4 py-3 bg-card'>
              <div>
                <p className='font-semibold text-sm'>{addon.label}</p>
                <p className='text-xs text-muted-foreground mt-0.5'>
                  {addon.displayPrice}
                  {addon.priceNote}
                </p>
              </div>
              <div className='flex items-center gap-2'>
                <Button
                  type='button'
                  size='icon'
                  variant='outline'
                  className='h-7 w-7'
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                >
                  −
                </Button>
                <span className='w-8 text-center font-semibold text-sm tabular-nums'>{quantity}</span>
                <Button type='button' size='icon' variant='outline' className='h-7 w-7' onClick={() => setQuantity(q => Math.min(50, q + 1))}>
                  +
                </Button>
              </div>
            </div>
          )}

          {/* TX package selector */}
          {isTxGroup &&
            (loadingTx
              ? [1, 2, 3].map(i => <div key={i} className='h-16 rounded-lg bg-muted animate-pulse' />)
              : txPackages.map(pkg => (
                  <button
                    key={pkg.id}
                    type='button'
                    onClick={() => setSelectedTxId(pkg.id)}
                    className={cn(
                      'w-full flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-all',
                      'hover:border-primary/60 hover:bg-primary/5',
                      selectedTxId === pkg.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card',
                    )}
                  >
                    <div>
                      <p className='font-semibold text-sm'>{pkg.label}</p>
                      <p className='text-xs text-muted-foreground mt-0.5'>+{pkg.txAmount.toLocaleString()} transactions/mo — auto-renews</p>
                    </div>
                    <span className='font-bold text-base tabular-nums text-primary'>{pkg.displayPrice}/mo</span>
                  </button>
                )))}

          {/* Capability addon — just a confirm */}
          {!isTxGroup && !isPerUnit && (
            <div className='flex items-center justify-between rounded-lg border px-4 py-3 bg-card'>
              <div>
                <p className='font-semibold text-sm'>{addon.label}</p>
                <p className='text-xs text-muted-foreground mt-0.5'>Renews monthly. Cancel any time from the billing portal.</p>
              </div>
              <span className='font-bold text-base tabular-nums text-primary'>
                {addon.displayPrice}
                {addon.priceNote}
              </span>
            </div>
          )}

          {isPerUnit && quantity > 1 && (
            <p className='text-xs text-muted-foreground text-right'>
              Total: {addon.displayPrice.replace('₱', '')} × {quantity} = ₱
              {(parseInt(addon.displayPrice.replace('₱', '').replace(',', ''), 10) * quantity).toLocaleString()}/mo
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={handleClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canProceed || mutation.isPending} className='gap-1.5'>
            {mutation.isPending ? (
              'Redirecting…'
            ) : (
              <>
                <ExternalLinkIcon className='h-3.5 w-3.5' /> Proceed to payment
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// ActiveAddons
// ---------------------------------------------------------------------------

function ActiveAddons() {
  const user = useStore(authStore, state => state.user)
  const entitlement = user?.entitlement
  const [activeAddon, setActiveAddon] = useState<AddonCatalogItem | null>(null)

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
    <>
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
                      onClick={() => openWith && setActiveAddon(openWith)}
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

      <AddonDialog addon={activeAddon} open={!!activeAddon} onClose={() => setActiveAddon(null)} />
    </>
  )
}

// ---------------------------------------------------------------------------
// BillingCTAs — Phase 4
// Renders the appropriate action buttons for the current subscription status.
// Cancel confirmation uses AlertDialog to prevent accidental cancellation.
// ---------------------------------------------------------------------------

function BillingCTAs({ status, isBlocked, cancelledAt }: { status: SubscriptionStatus; isBlocked: boolean; cancelledAt: string | null | undefined }) {
  const [cancelOpen, setCancelOpen] = useState(false)

  const canReactivate = SubscriptionStatusVO.canReactivate(status)

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
        <Button size='sm' variant='default' asChild>
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

      {isBlocked && status !== SubscriptionStatus.LONG_TERM_INACTIVE && (
        <Button size='sm' variant='default' asChild>
          <Link to={'/billing/plans'}>
            <RefreshCwIcon className='h-4 w-4 mr-1.5' />
            Reactivate Subscription
          </Link>
        </Button>
      )}

      {/* Reactivation � for expired, cancelled, and inactive statuses */}
      {canReactivate && (
        <Button size='sm' variant='default' asChild>
          <Link to='/subscription/reactivate'>
            <RefreshCwIcon className='h-4 w-4 mr-1.5' />
            {status === SubscriptionStatus.LONG_TERM_INACTIVE ? 'Reactivate Account' : 'Reactivate Subscription'}
          </Link>
        </Button>
      )}

      {/* Suspended status � contact support */}
      {status === SubscriptionStatus.SUSPENDED && (
        <Button size='sm' variant='outline' asChild>
          <a href='mailto:support@startpos.app'>
            <MailIcon className='h-4 w-4 mr-1.5' />
            Contact Support
          </a>
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
