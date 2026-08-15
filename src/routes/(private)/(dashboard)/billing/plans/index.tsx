/**
 * billing/plans/index.tsx
 *
 * /billing/plans — Plan selection page.
 *
 * Handles two modes:
 *   - New subscriber (no active subscription): calls createSubscription.
 *   - Existing subscriber (active plan): shows a change dialog with billing
 *     model selector, then calls changeSubscription.
 *
 * Architecture:
 *   - No price calculations in the component — prices come from DB via fetchPlans.
 *   - createSubscription handles first-time activation.
 *   - changeSubscription handles all plan/model switching (immediate).
 *   - isCurrent is derived from authStore.entitlement.planId.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { AlertTriangleIcon, ArrowLeftIcon, ArrowRightIcon, CheckIcon, CoinsIcon, LayersIcon, ServerIcon, SparklesIcon, ZapIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { GCashPaymentGuide } from '@/components/custom/gcash-payment-guide'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { BillingModel } from '@/lib/billing/types'
import { changeSubscription } from '@/lib/queries/change-subscription'
import { createSubscription } from '@/lib/queries/create-subscription'
import { fetchPlans, type PlanWithEntitlements } from '@/lib/server-fn/fetch-plans'
import { cn } from '@/lib/utils'
import { authStore } from '@/store/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/billing/plans/')({
  component: PlansPage,
})

// ---------------------------------------------------------------------------
// Billing method toggle
// ---------------------------------------------------------------------------

type BillingMethod = 'monthly' | 'annual' | 'credits'

const BILLING_METHODS: Array<{ value: BillingMethod; label: string; badge?: string }> = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
  { value: 'credits', label: 'Pay as you go' },
]

// ---------------------------------------------------------------------------
// Per-plan feature highlights
// ---------------------------------------------------------------------------

type PlanHighlight = { text: string }
type PlanDetails = { tagline: string; features: PlanHighlight[] }

const PLAN_DETAILS: Record<string, PlanDetails> = {
  Basic: {
    tagline: 'Everything a solo operator needs to run a single location.',
    features: [
      { text: '1,000 transactions / month' },
      { text: '1 employee account' },
      { text: '1 branch' },
      { text: 'POS checkout, payments & refunds' },
      { text: 'Customer orders & order management' },
      { text: 'Product catalogue & variants' },
      { text: 'Customer directory' },
      { text: 'Full transaction & order history' },
      { text: 'Receipt printing & download' },
    ],
  },
  Premium: {
    tagline: 'For growing teams that need inventory control.',
    features: [
      { text: 'Everything in Basic' },
      { text: '5,000 transactions / month' },
      { text: 'Up to 3 branches' },
      { text: 'Inventory adjustments & transfers' },
      { text: 'Vendor cash sessions & reconciliation' },
      { text: 'Sales & inventory reports' },
      { text: 'CSV data export' },
    ],
  },
  Enterprise: {
    tagline: 'For multi-location operations running at scale.',
    features: [
      { text: 'Everything in Premium' },
      { text: '10,000 transactions / month' },
      { text: 'Up to 5 branches' },
      { text: 'Supplier records & management' },
      { text: 'Purchase orders & stock receiving' },
      { text: 'Restocking tasks' },
      { text: 'Priority support' },
    ],
  },
}

// ---------------------------------------------------------------------------
// Price calculation helpers
// ---------------------------------------------------------------------------

function getDisplayPrice(plan: PlanWithEntitlements, method: BillingMethod): string {
  if (plan.monthlyPrice === 0) return 'Free'
  if (method === 'credits') return 'Pay per TX'
  if (method === 'annual') {
    // Use DB annualPrice ÷ 12 as the monthly-equivalent display price.
    // Falls back to monthlyPrice × 0.8 when annualPrice is not yet seeded.
    const annual = plan.annualPrice ?? Math.round(plan.monthlyPrice * 0.8 * 12)
    const perMonth = Math.round(annual / 12)
    return `₱${(perMonth / 100).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`
  }
  return `₱${(plan.monthlyPrice / 100).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`
}

function getAnnualTotal(plan: PlanWithEntitlements): string {
  if (plan.monthlyPrice === 0) return ''
  const annual = plan.annualPrice ?? Math.round(plan.monthlyPrice * 0.8 * 12)
  return `₱${(annual / 100).toLocaleString('en-PH', { minimumFractionDigits: 0 })} billed annually`
}

function getAnnualSavingsLabel(plan: PlanWithEntitlements): string {
  if (plan.monthlyPrice === 0) return ''
  const monthlyTotal = plan.monthlyPrice * 12
  const annual = plan.annualPrice ?? Math.round(plan.monthlyPrice * 0.8 * 12)
  const savingsCents = monthlyTotal - annual
  if (savingsCents <= 0) return ''
  const pct = Math.round((savingsCents / monthlyTotal) * 100)
  return `Save ${pct}%`
}

// ---------------------------------------------------------------------------
// Change plan dialog
// Shown when the user already has an active subscription and selects a plan.
// ---------------------------------------------------------------------------

interface ChangePlanDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  plan: PlanWithEntitlements
  billingMethod: BillingMethod
  currentBillingModel: string | null
  creditBalance: number | null
  isPending: boolean
  onConfirm: (method: BillingMethod) => void
}

function ChangePlanDialog({ open, onOpenChange, plan, billingMethod, currentBillingModel, creditBalance, isPending, onConfirm }: ChangePlanDialogProps) {
  const [selectedMethod, setSelectedMethod] = useState<BillingMethod>(billingMethod)

  const isFromCredits = currentBillingModel === BillingModel.PREPAID_CREDITS
  const toCredits = selectedMethod === 'credits'
  const hasCredits = (creditBalance ?? 0) > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-sm'>
        <DialogHeader>
          <DialogTitle>Switch to {plan.name}</DialogTitle>
          <DialogDescription>This change takes effect immediately. Choose how you want to be billed.</DialogDescription>
        </DialogHeader>

        {/* Billing method selector */}
        <div className='space-y-1.5'>
          {BILLING_METHODS.map(m => {
            const price = getDisplayPrice(plan, m.value)
            return (
              <button
                key={m.value}
                type='button'
                onClick={() => setSelectedMethod(m.value)}
                className={cn(
                  'w-full flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-all',
                  'hover:border-primary/60 hover:bg-primary/5',
                  selectedMethod === m.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card',
                )}
              >
                <div>
                  <p className='text-sm font-medium'>{m.label}</p>
                  {m.value === 'annual' && plan.monthlyPrice > 0 && <p className='text-xs text-muted-foreground mt-0.5'>{getAnnualTotal(plan)}</p>}
                  {m.value === 'credits' && <p className='text-xs text-muted-foreground mt-0.5'>1 credit = 1 transaction</p>}
                  {m.value === 'monthly' && plan.monthlyPrice > 0 && <p className='text-xs text-muted-foreground mt-0.5'>billed monthly</p>}
                </div>
                <span className='font-bold text-sm tabular-nums text-primary shrink-0 ml-3'>{price}</span>
              </button>
            )
          })}
        </div>

        <Separator />

        {/* Contextual info depending on switching direction */}
        {toCredits && (
          <div className='flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/60 px-3 py-2.5'>
            <AlertTriangleIcon className='h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5' />
            <p className='text-xs text-blue-800 dark:text-blue-300 leading-relaxed'>
              Your current subscription will be cancelled immediately. You&apos;ll switch to pay-per-transaction billing — buy credits from the credits page.
              {hasCredits && (
                <>
                  {' '}
                  Your existing {creditBalance} credit{creditBalance === 1 ? '' : 's'} will remain available.
                </>
              )}
            </p>
          </div>
        )}

        {isFromCredits && !toCredits && (
          <div className='flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 px-3 py-2.5'>
            <AlertTriangleIcon className='h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5' />
            <p className='text-xs text-amber-800 dark:text-amber-300 leading-relaxed'>
              You&apos;ll be redirected to complete payment.
              {hasCredits && (
                <>
                  {' '}
                  Your {creditBalance} remaining credit{creditBalance === 1 ? '' : 's'} will stay as a buffer for extra transactions.
                </>
              )}
            </p>
          </div>
        )}

        {!isFromCredits && !toCredits && (
          <div className='rounded-lg bg-muted/40 px-3 py-2'>
            <p className='text-xs text-muted-foreground leading-relaxed'>The prorated difference will be charged or credited to your card immediately.</p>
          </div>
        )}

        <DialogFooter className='gap-2 sm:gap-0'>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(selectedMethod)} disabled={isPending}>
            {isPending ? 'Processing…' : toCredits ? 'Switch to Credits' : 'Proceed to payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// PlansPage
// ---------------------------------------------------------------------------

function PlansPage() {
  const [billingMethod, setBillingMethod] = useState<BillingMethod>('monthly')
  const [selectingPlan, setSelectingPlan] = useState<PlanWithEntitlements | null>(null)
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null)

  const { user } = useStore(authStore, state => state)
  const activePlanId = user?.entitlement?.planId ?? null
  const activeBillingModel = user?.entitlement?.billingModel ?? null
  const creditBalance = user?.entitlement?.creditBalance ?? null
  const hasActiveSubscription = !!activePlanId

  const queryClient = useQueryClient()

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: () => fetchPlans(),
  })

  // First-time subscription (no active plan)
  const createMutation = useMutation({
    mutationFn: (planId: string) =>
      createSubscription({
        data: {
          planId,
          billingInterval: billingMethod === 'annual' ? 'annual' : 'monthly',
          billingModel: billingMethod === 'credits' ? 'PREPAID_CREDITS' : undefined,
        },
      }),
    onSuccess: result => {
      if (!result.success) {
        toast.error(result.error)
        return
      }
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl
        return
      }
      toast.success('Subscription activated!')
      queryClient.invalidateQueries({ queryKey: ['plans'] })
    },
    onError: () => toast.error('Something went wrong. Please try again.'),
    onSettled: () => setPendingPlanId(null),
  })

  // Plan / billing model change (already has active subscription)
  const changeMutation = useMutation({
    mutationFn: ({ planId, method }: { planId: string; method: BillingMethod }) =>
      changeSubscription({
        data: {
          planId,
          billingModel: method === 'credits' ? 'PREPAID_CREDITS' : method === 'annual' ? 'YEARLY_SUBSCRIPTION' : 'MONTHLY_SUBSCRIPTION',
          billingInterval: method === 'annual' ? 'annual' : 'monthly',
        },
      }),
    onSuccess: result => {
      if (!result.success) {
        toast.error(result.error)
        return
      }
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl
        return
      }
      toast.success(result.message ?? 'Plan updated successfully.')
      queryClient.invalidateQueries({ queryKey: ['plans'] })
    },
    onError: () => toast.error('Something went wrong. Please try again.'),
    onSettled: () => {
      setPendingPlanId(null)
      setSelectingPlan(null)
    },
  })

  const isPending = createMutation.isPending || changeMutation.isPending

  const handleSelectPlan = (plan: PlanWithEntitlements) => {
    if (hasActiveSubscription) {
      // Open the change dialog so user can pick billing method
      setSelectingPlan(plan)
    } else {
      // First-time subscriber — go straight to checkout
      setPendingPlanId(plan.id)
      createMutation.mutate(plan.id)
    }
  }

  const handleConfirmChange = (method: BillingMethod) => {
    if (!selectingPlan) return
    setPendingPlanId(selectingPlan.id)
    changeMutation.mutate({ planId: selectingPlan.id, method })
  }

  return (
    <div className='flex flex-col gap-6 px-4 max-w-5xl'>
      {/* Header */}
      <div className='flex items-center gap-3'>
        <Button variant='ghost' size='icon' asChild className='shrink-0'>
          <Link to='/billing'>
            <ArrowLeftIcon className='h-4 w-4' />
          </Link>
        </Button>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>{hasActiveSubscription ? 'Change your plan' : 'Choose a plan'}</h1>
          <p className='text-sm text-muted-foreground mt-0.5'>
            {hasActiveSubscription
              ? 'Switch plans or billing models instantly. Changes take effect immediately.'
              : 'Pick the tier that fits your business. Change or cancel any time.'}
          </p>
        </div>
      </div>

      {/* Billing method toggle — only shown for new subscribers since existing
          subscribers pick billing method inside the change dialog */}
      {!hasActiveSubscription && (
        <div className='flex flex-col gap-2'>
          <div className='flex items-center gap-1 p-1 bg-muted rounded-lg w-fit'>
            {BILLING_METHODS.map(method => {
              // Compute a representative savings label for the annual toggle badge
              // using the first paid plan returned (lowest sort order).
              const firstPaidPlan = plans.find(p => p.monthlyPrice > 0 && p.name !== 'Trial')
              const savingsLabel = method.value === 'annual' && firstPaidPlan ? getAnnualSavingsLabel(firstPaidPlan) : ''
              return (
                <button
                  key={method.value}
                  type='button'
                  onClick={() => setBillingMethod(method.value)}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                    billingMethod === method.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {method.value === 'monthly' && <ZapIcon className='h-3.5 w-3.5' />}
                  {method.value === 'annual' && <SparklesIcon className='h-3.5 w-3.5' />}
                  {method.value === 'credits' && <CoinsIcon className='h-3.5 w-3.5' />}
                  {method.label}
                  {savingsLabel && (
                    <Badge variant='secondary' className='text-[10px] px-1.5 py-0 h-4 font-semibold text-emerald-700 bg-emerald-100'>
                      {savingsLabel}
                    </Badge>
                  )}
                </button>
              )
            })}
          </div>
          {billingMethod === 'annual' && (
            <p className='text-xs text-muted-foreground'>Annual pricing requires separate Stripe price IDs. Contact your admin if checkout fails.</p>
          )}
        </div>
      )}

      {/* GCash payment guide */}
      <GCashPaymentGuide />

      {/* Plan cards */}
      {isLoading ? (
        <div className='grid gap-4 sm:grid-cols-3'>
          {[1, 2, 3].map(i => (
            <Card key={i} className='animate-pulse'>
              <CardHeader className='h-32 bg-muted/50 rounded-t-lg' />
              <CardContent className='h-40 bg-muted/30' />
            </Card>
          ))}
        </div>
      ) : (
        <div className='grid gap-4 sm:grid-cols-3'>
          {plans
            .filter(p => p.name !== 'Perpetual License' && p.name !== 'Trial')
            .map(plan => {
              const isPopular = plan.name === 'Premium'
              const isCurrent = plan.id === activePlanId
              const details = PLAN_DETAILS[plan.name]
              const isProcessing = pendingPlanId === plan.id && isPending

              return (
                <Card
                  key={plan.id}
                  className={cn(
                    'relative flex flex-col transition-shadow',
                    isCurrent && 'border-primary shadow-md shadow-primary/10',
                    isPopular && !isCurrent && 'border-muted-foreground/40',
                  )}
                >
                  {isCurrent && (
                    <div className='absolute -top-3 left-1/2 -translate-x-1/2'>
                      <Badge className='bg-primary text-primary-foreground text-[10px] px-2.5 py-0.5'>Current plan</Badge>
                    </div>
                  )}
                  {isPopular && !isCurrent && (
                    <div className='absolute -top-3 left-1/2 -translate-x-1/2'>
                      <Badge variant='secondary' className='text-[10px] px-2.5 py-0.5'>
                        Most popular
                      </Badge>
                    </div>
                  )}

                  <CardHeader className='pb-3'>
                    <CardTitle className='text-lg'>{plan.name}</CardTitle>
                    {details && <p className='text-xs text-muted-foreground leading-relaxed'>{details.tagline}</p>}
                  </CardHeader>

                  <CardContent className='flex-1 space-y-4'>
                    <div>
                      <p className='text-3xl font-bold tracking-tight tabular-nums'>{getDisplayPrice(plan, billingMethod)}</p>
                      <p className='text-xs text-muted-foreground mt-0.5'>
                        {billingMethod === 'annual' && plan.monthlyPrice > 0
                          ? getAnnualTotal(plan)
                          : billingMethod === 'credits'
                            ? '1 credit = 1 transaction'
                            : plan.monthlyPrice > 0
                              ? 'per month, billed monthly'
                              : '\u00a0'}
                      </p>
                    </div>

                    {details && (
                      <ul className='space-y-1.5'>
                        {details.features.map(f => (
                          <li key={f.text} className='flex items-start gap-2 text-xs'>
                            <CheckIcon className='h-3.5 w-3.5 text-primary shrink-0 mt-px' />
                            <span className='leading-snug text-muted-foreground'>{f.text}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>

                  <CardFooter className='pt-4'>
                    {isCurrent ? (
                      <Button className='w-full' variant='outline' disabled>
                        Current plan
                      </Button>
                    ) : (
                      <Button className='w-full' variant={isPopular ? 'default' : 'outline'} disabled={isPending} onClick={() => handleSelectPlan(plan)}>
                        {isProcessing ? 'Processing…' : hasActiveSubscription ? `Switch to ${plan.name}` : `Get ${plan.name}`}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              )
            })}
        </div>
      )}

      {/* Bottom CTAs */}
      <Card className='border-dashed'>
        <CardContent className='flex items-center justify-between py-5'>
          <div className='flex items-center gap-3'>
            <div className='p-2 rounded-lg bg-muted'>
              <LayersIcon className='h-5 w-5 text-muted-foreground' />
            </div>
            <div>
              <p className='text-sm font-medium'>Need something custom?</p>
              <p className='text-xs text-muted-foreground'>Build your own plan — pick only the features you need and pay accordingly.</p>
            </div>
          </div>
          <Button variant='ghost' size='sm' asChild className='shrink-0 gap-1'>
            <Link to='/billing/pricing'>
              Build custom plan <ArrowRightIcon className='h-3.5 w-3.5' />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {plans.some(p => p.name === 'Perpetual License') && (
        <Card className='border-dashed'>
          <CardContent className='flex items-center justify-between py-5'>
            <div className='flex items-center gap-3'>
              <div className='p-2 rounded-lg bg-muted'>
                <ServerIcon className='h-5 w-5 text-muted-foreground' />
              </div>
              <div>
                <p className='text-sm font-medium'>Self-host with a perpetual license</p>
                <p className='text-xs text-muted-foreground'>Own the software outright. Full Enterprise features, unlimited transactions, one-time fee.</p>
              </div>
            </div>
            <Button variant='ghost' size='sm' asChild className='shrink-0 gap-1'>
              <Link to='/contact-us'>
                Contact us <ArrowRightIcon className='h-3.5 w-3.5' />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {billingMethod === 'annual' && !hasActiveSubscription && (
        <p className='text-xs text-muted-foreground text-center'>
          Annual billing locks in 20% savings. Billed as a single upfront payment. Cancel before renewal for a prorated refund.
        </p>
      )}

      {/* Change plan dialog — only shown for existing subscribers */}
      {selectingPlan && (
        <ChangePlanDialog
          open={!!selectingPlan}
          onOpenChange={v => {
            if (!v) setSelectingPlan(null)
          }}
          plan={selectingPlan}
          billingMethod={billingMethod}
          currentBillingModel={activeBillingModel}
          creditBalance={creditBalance}
          isPending={isPending}
          onConfirm={handleConfirmChange}
        />
      )}
    </div>
  )
}
