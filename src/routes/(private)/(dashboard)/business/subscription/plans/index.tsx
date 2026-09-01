/**
 * /business/subscription/plans — Plan selection page.
 *
 * Clicking a plan card navigates to /business/subscription/checkout?planId=...
 * The checkout page handles billing interval, payment method, and form.
 */

import { GCashPaymentGuide } from '../-components/gcash-payment-guide'
import { Badge } from '@startpos-core/components/ui/badge'
import { Button } from '@startpos-core/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@startpos-core/components/ui/card'
import { Separator } from '@startpos-core/components/ui/separator'
import { getPendingManualPayment } from '@/lib/server-fn/get-pending-manual-payment'
import { fetchPlans, type PlanWithEntitlements } from '@/lib/server-fn/fetch-plans'
import { cn } from '@startpos-core/lib/utils'
import { authStore } from '@startpos-core/lib/better-auth/auth-store'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  LayersIcon,
  ServerIcon,
  SparklesIcon,
  ZapIcon,
} from 'lucide-react'
import { useState } from 'react'

export const Route = createFileRoute('/(private)/(dashboard)/business/subscription/plans/')({
  component: PlansPage,
})

// ---------------------------------------------------------------------------
// Types / constants
// ---------------------------------------------------------------------------

type BillingInterval = 'monthly' | 'annual'

const PLAN_DETAILS: Record<string, { tagline: string; features: string[] }> = {
  Basic: {
    tagline: 'Everything a solo operator needs to run a single location.',
    features: [
      '1,000 transactions / month',
      '1 employee account',
      '1 branch',
      'POS checkout, payments & refunds',
      'Customer orders & order management',
      'Product catalogue & variants',
      'Customer directory',
    ],
  },
  Premium: {
    tagline: 'For growing teams that need inventory control.',
    features: [
      'Everything in Basic',
      '5,000 transactions / month',
      'Up to 3 branches',
      'Inventory adjustments & transfers',
      'Vendor cash sessions & reconciliation',
      'Sales & inventory reports',
      'CSV data export',
    ],
  },
  Enterprise: {
    tagline: 'For multi-location operations running at scale.',
    features: [
      'Everything in Premium',
      '10,000 transactions / month',
      'Up to 5 branches',
      'Supplier records & management',
      'Purchase orders & stock receiving',
      'Restocking tasks',
      'Priority support',
    ],
  },
}

// ---------------------------------------------------------------------------
// Price helpers
// ---------------------------------------------------------------------------

function getAnnualTotal(plan: PlanWithEntitlements): number {
  return plan.annualPrice ?? Math.round(plan.monthlyPrice * 0.8 * 12)
}

function getDisplayPrice(plan: PlanWithEntitlements, interval: BillingInterval): string {
  if (plan.monthlyPrice === 0) return 'Free'
  if (interval === 'annual') {
    const perMonth = Math.round(getAnnualTotal(plan) / 12)
    return `₱${(perMonth / 100).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`
  }
  return `₱${(plan.monthlyPrice / 100).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`
}

function getAnnualSubtext(plan: PlanWithEntitlements): string {
  const annual = getAnnualTotal(plan)
  return `₱${(annual / 100).toLocaleString('en-PH', { minimumFractionDigits: 0 })} billed annually`
}

function getSavingsPct(plan: PlanWithEntitlements): number | null {
  if (plan.monthlyPrice === 0) return null
  const fullYear = plan.monthlyPrice * 12
  const annual = getAnnualTotal(plan)
  const saved = fullYear - annual
  if (saved <= 0) return null
  return Math.round((saved / fullYear) * 100)
}

// ---------------------------------------------------------------------------
// PlansPage
// ---------------------------------------------------------------------------

function PlansPage() {
  const navigate = useNavigate()
  const [interval, setInterval] = useState<BillingInterval>('monthly')

  const { user } = useStore(authStore, s => s)
  const activePlanId = user?.entitlement?.planId ?? null
  const hasActiveSub = !!activePlanId

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: fetchPlans,
  })

  const { data: pendingData } = useQuery({
    queryKey: ['pending-manual-payment'],
    queryFn: () => getPendingManualPayment(),
  })

  const hasPending = pendingData?.hasPending ?? false
  const pendingPayment = pendingData?.payment ?? null

  const handleSelect = (plan: PlanWithEntitlements) => {
    if (hasPending) return // blocked — pending banner handles the UX
    navigate({
      to: '/business/subscription/checkout' as never,
      search: { planId: plan.id, interval } as never,
    })
  }

  const firstPaid = plans.find(p => p.monthlyPrice > 0)
  const savingsPct = firstPaid ? getSavingsPct(firstPaid) : null

  return (
    <div className='flex flex-col gap-6 px-4 pb-6 max-w-5xl'>
      {/* Header */}
      <div className='flex items-center gap-3'>
        <Button variant='ghost' size='icon' asChild className='shrink-0'>
          <Link to='/business/subscription'>
            <ArrowLeftIcon className='h-4 w-4' />
          </Link>
        </Button>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>
            {hasActiveSub ? 'Change your plan' : 'Choose a plan'}
          </h1>
          <p className='text-sm text-muted-foreground mt-0.5'>
            {hasActiveSub
              ? 'Select a plan to go to checkout.'
              : 'Pick the tier that fits your business. Change or cancel any time.'}
          </p>
        </div>
      </div>

      {/* GCash guide — 2nd element */}
      <GCashPaymentGuide />

      {/* Pending payment banner */}
      {hasPending && pendingPayment && (
        <div className='flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 px-4 py-3'>
          <ClockIcon className='h-5 w-5 text-amber-600 shrink-0 mt-0.5' />
          <div className='flex-1 min-w-0'>
            <p className='text-sm font-semibold text-amber-900 dark:text-amber-300'>
              Payment under review
            </p>
            <p className='text-xs text-amber-800 dark:text-amber-400 mt-0.5 leading-relaxed'>
              You have a manual payment of ₱{((pendingPayment.amount ?? 0) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })} submitted on{' '}
              {new Date(pendingPayment.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}.
              Plan selection is locked until it is approved or rejected.
            </p>
          </div>
        </div>
      )}

      {/* Billing interval toggle — centered */}
      <div className='flex justify-center'>
        <div className='flex items-center gap-1 p-1 bg-muted rounded-lg'>
          <button
            type='button'
            onClick={() => setInterval('monthly')}
            className={cn(
              'flex items-center gap-1.5 px-5 py-1.5 rounded-md text-sm font-medium transition-colors',
              interval === 'monthly'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <ZapIcon className='h-3.5 w-3.5' />
            Monthly
          </button>
          <button
            type='button'
            onClick={() => setInterval('annual')}
            className={cn(
              'flex items-center gap-1.5 px-5 py-1.5 rounded-md text-sm font-medium transition-colors',
              interval === 'annual'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <SparklesIcon className='h-3.5 w-3.5' />
            Annual
            {savingsPct && (
              <Badge variant='secondary' className='text-[10px] px-1.5 py-0 h-4 font-semibold text-emerald-700 bg-emerald-100'>
                Save {savingsPct}%
              </Badge>
            )}
          </button>
        </div>
      </div>

      {/* Plan cards — mt-6 gives room for the absolute badge above cards */}
      {isLoading ? (
        <div className='grid gap-4 sm:grid-cols-3 mt-2'>
          {[1, 2, 3].map(i => (
            <Card key={i} className='animate-pulse'>
              <CardHeader className='h-32 bg-muted/50 rounded-t-lg' />
              <CardContent className='h-40 bg-muted/30' />
            </Card>
          ))}
        </div>
      ) : (
        <div className='grid gap-4 sm:grid-cols-3 mt-2'>
          {plans
            .filter(p => p.name !== 'Perpetual License' && p.name !== 'Trial')
            .map(plan => {
              const isPopular = plan.name === 'Premium'
              const isCurrent = plan.id === activePlanId
              const details = PLAN_DETAILS[plan.name]

              return (
                <div key={plan.id} className='relative'>
                  {/* Badges sit outside Card to avoid overflow-hidden clipping */}
                  {isCurrent && (
                    <div className='absolute -top-3 left-1/2 -translate-x-1/2 z-10'>
                      <Badge className='bg-primary text-primary-foreground text-[10px] px-2.5 py-0.5'>
                        Current plan
                      </Badge>
                    </div>
                  )}
                  {isPopular && !isCurrent && (
                    <div className='absolute -top-3 left-1/2 -translate-x-1/2 z-10'>
                      <Badge variant='secondary' className='text-[10px] px-2.5 py-0.5'>
                        Most popular
                      </Badge>
                    </div>
                  )}

                  <Card
                    className={cn(
                      'flex flex-col h-full transition-shadow',
                      isCurrent && 'border-primary shadow-md shadow-primary/10',
                      isPopular && !isCurrent && 'border-muted-foreground/40',
                    )}
                  >
                    {/* Plan name + tagline */}
                    <CardHeader className='pb-3'>
                      <CardTitle className='text-lg'>{plan.name}</CardTitle>
                      {details && (
                        <p className='text-xs text-muted-foreground leading-relaxed min-h-[2.5rem]'>{details.tagline}</p>
                      )}
                    </CardHeader>

                    <CardContent className='flex-1 flex flex-col gap-4'>
                      {/* Price — fixed height so all cards align */}
                      <div className='min-h-[3.5rem]'>
                        <p className='text-3xl font-bold tracking-tight tabular-nums'>
                          {getDisplayPrice(plan, interval)}
                          {plan.monthlyPrice > 0 && (
                            <span className='text-sm font-normal text-muted-foreground'>/mo</span>
                          )}
                        </p>
                        <p className='text-xs text-muted-foreground mt-0.5'>
                          {interval === 'annual' && plan.monthlyPrice > 0
                            ? getAnnualSubtext(plan)
                            : plan.monthlyPrice > 0
                              ? 'billed monthly'
                              : '\u00a0'}
                        </p>
                      </div>

                      <Separator />

                      {/* Features */}
                      {details && (
                        <ul className='flex-1 space-y-1.5'>
                          {details.features.map(f => (
                            <li key={f} className='flex items-start gap-2 text-xs'>
                              <CheckIcon className='h-3.5 w-3.5 text-primary shrink-0 mt-px' />
                              <span className='leading-snug text-muted-foreground'>{f}</span>
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
                      ) : hasPending ? (
                        <Button className='w-full' variant='outline' disabled>
                          <ClockIcon className='mr-2 h-3.5 w-3.5' />
                          Payment pending review
                        </Button>
                      ) : (
                        <Button
                          className='w-full'
                          variant={isPopular ? 'default' : 'outline'}
                          onClick={() => handleSelect(plan)}
                        >
                          {hasActiveSub ? `Switch to ${plan.name}` : `Get ${plan.name}`}
                          <ArrowRightIcon className='ml-2 h-3.5 w-3.5' />
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                </div>
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
              <p className='text-xs text-muted-foreground'>
                Build your own plan — pick only the features you need.
              </p>
            </div>
          </div>
          {hasPending ? (
            <Button variant='ghost' size='sm' disabled className='shrink-0 gap-1'>
              <ClockIcon className='h-3.5 w-3.5' />
              Payment pending
            </Button>
          ) : (
            <Button variant='ghost' size='sm' asChild className='shrink-0 gap-1'>
              <Link to='/business/subscription/pricing'>
                Build custom plan <ArrowRightIcon className='h-3.5 w-3.5' />
              </Link>
            </Button>
          )}
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
                <p className='text-xs text-muted-foreground'>
                  Own the software outright. Full Enterprise features, unlimited transactions, one-time fee.
                </p>
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

      {interval === 'annual' && (
        <p className='text-xs text-muted-foreground text-center'>
          Annual billing locks in savings. Billed as a single upfront payment. Cancel before renewal for a prorated refund.
        </p>
      )}
    </div>
  )
}
