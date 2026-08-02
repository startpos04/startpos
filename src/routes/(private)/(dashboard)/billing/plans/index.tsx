/**
 * billing/plans/index.tsx
 *
 * /billing/plans — Plan selection page.
 *
 * Single screen where the user picks both a tier (Basic / Premium / Enterprise)
 * and a billing method (Monthly / Annual / Credits) simultaneously.
 * Selecting a plan + billing method goes straight to Stripe checkout — no
 * second page, no decision fatigue.
 *
 * Custom plan (composable feature picker) links to /billing/pricing.
 *
 * Architecture:
 *   - No price calculations in the component — uses PlanEngine helpers.
 *   - Plan data fetched server-side via fetchPlans.
 *   - createSubscription / purchaseCreditPackage handle the actual checkout.
 */

import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, CreditCardIcon, LayersIcon, SparklesIcon, ZapIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { PlanEngine } from '@/lib/billing/plan-engine'
import { createSubscription } from '@/lib/queries/create-subscription'
import { fetchPlans, type PlanWithEntitlements } from '@/lib/server-fn/fetch-plans'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/(private)/(dashboard)/billing/plans/')({
  component: PlansPage,
})

// ---------------------------------------------------------------------------
// Billing method toggle
// ---------------------------------------------------------------------------

type BillingMethod = 'monthly' | 'annual' | 'credits'

const BILLING_METHODS: Array<{ value: BillingMethod; label: string; badge?: string }> = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual', badge: 'Save 20%' },
  { value: 'credits', label: 'Credits' },
]

// ---------------------------------------------------------------------------
// Per-plan feature highlights
// These are the key selling points shown on each card — not the full
// capability list (that's in the DB). Kept in component for UI clarity.
// ---------------------------------------------------------------------------

type PlanHighlight = {
  icon: React.ReactNode
  text: string
}

const PLAN_HIGHLIGHTS: Record<string, PlanHighlight[]> = {
  Basic: [
    { icon: <CheckIcon className='h-3.5 w-3.5' />, text: 'POS checkout & payments' },
    { icon: <CheckIcon className='h-3.5 w-3.5' />, text: 'Product catalogue management' },
    { icon: <CheckIcon className='h-3.5 w-3.5' />, text: 'Customers & orders' },
    { icon: <CheckIcon className='h-3.5 w-3.5' />, text: 'Sales & inventory reports' },
    { icon: <CheckIcon className='h-3.5 w-3.5' />, text: '1 employee account' },
  ],
  Premium: [
    { icon: <CheckIcon className='h-3.5 w-3.5' />, text: 'Everything in Basic' },
    { icon: <CheckIcon className='h-3.5 w-3.5' />, text: 'Inventory management' },
    { icon: <CheckIcon className='h-3.5 w-3.5' />, text: 'Unlimited employees' },
    { icon: <CheckIcon className='h-3.5 w-3.5' />, text: 'Vendor sessions & cash reconciliation' },
    { icon: <CheckIcon className='h-3.5 w-3.5' />, text: 'Supplier management & data export' },
  ],
  Enterprise: [
    { icon: <CheckIcon className='h-3.5 w-3.5' />, text: 'Everything in Premium' },
    { icon: <CheckIcon className='h-3.5 w-3.5' />, text: 'Purchase orders & receiving' },
    { icon: <CheckIcon className='h-3.5 w-3.5' />, text: 'Operational tasks' },
    { icon: <CheckIcon className='h-3.5 w-3.5' />, text: 'Up to 5 branches' },
    { icon: <CheckIcon className='h-3.5 w-3.5' />, text: 'Unlimited transactions' },
  ],
}

// ---------------------------------------------------------------------------
// Price calculation helpers
// ---------------------------------------------------------------------------

function getDisplayPrice(plan: PlanWithEntitlements, method: BillingMethod): string {
  if (plan.monthlyPrice === 0) return 'Free'
  if (method === 'credits') return 'Pay per TX'
  const monthly = plan.monthlyPrice
  const amount = method === 'annual' ? monthly * 0.8 : monthly
  return PlanEngine.formatMonthlyPrice(Math.round(amount))
}

function getAnnualTotal(plan: PlanWithEntitlements): string {
  if (plan.monthlyPrice === 0) return ''
  const annual = Math.round(plan.monthlyPrice * 0.8 * 12)
  return `₱${(annual / 100).toLocaleString('en-PH', { minimumFractionDigits: 0 })} billed annually`
}

// ---------------------------------------------------------------------------
// PlansPage
// ---------------------------------------------------------------------------

function PlansPage() {
  const navigate = useNavigate()

  const [billingMethod, setBillingMethod] = useState<BillingMethod>('monthly')
  const [selectingPlanId, setSelectingPlanId] = useState<string | null>(null)

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: () => fetchPlans(),
  })

  const subscriptionMutation = useMutation({
    mutationFn: (planId: string) => createSubscription({ data: { planId } }),
    onSuccess: (result, planId) => {
      if (!result.success) {
        toast.error(result.error)
        return
      }
      if (result.checkoutUrl) {
        // Stripe will redirect back to /billing/success after payment completes.
        // Store the plan name in sessionStorage so the success page can read it
        // after the Stripe redirect (search params survive the redirect).
        window.location.href = result.checkoutUrl
        return
      }
      // Subscription activated without Stripe redirect (e.g. trial or auto-collect)
      toast.success('Subscription activated!')
      const planName = plans.find(p => p.id === planId)?.name ?? 'your plan'
      // biome-ignore lint/suspicious/noExplicitAny: /billing/success added; routeTree.gen.ts regeneration required
      navigate({ to: '/billing/success' as any, search: { plan: planName, billing: billingMethod } as any })
    },
    onError: () => toast.error('Something went wrong. Please try again.'),
    onSettled: () => setSelectingPlanId(null),
  })

  const handleSelectPlan = (plan: PlanWithEntitlements) => {
    setSelectingPlanId(plan.id)
    if (billingMethod === 'credits') {
      // Credits mode: navigate to /billing/success which has the add-on upsell,
      // then the user can buy credits from /billing/credits.
      setSelectingPlanId(null)
      // biome-ignore lint/suspicious/noExplicitAny: /billing/success added; routeTree.gen.ts regeneration required
      navigate({ to: '/billing/success' as any, search: { plan: plan.name, billing: 'credits' } as any })
      return
    }
    subscriptionMutation.mutate(plan.id)
  }

  const isPending = subscriptionMutation.isPending

  return (
    <div className='flex flex-col gap-6 p-4 pt-0 max-w-5xl'>
      {/* Header */}
      <div className='flex items-center gap-3'>
        <Button variant='ghost' size='icon' asChild className='shrink-0'>
          <Link to='/billing'>
            <ArrowLeftIcon className='h-4 w-4' />
          </Link>
        </Button>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Choose a plan</h1>
          <p className='text-sm text-muted-foreground mt-0.5'>Pick the tier that fits your business. Change or cancel any time.</p>
        </div>
      </div>

      {/* Billing method toggle */}
      <div className='flex items-center gap-1 p-1 bg-muted rounded-lg w-fit'>
        {BILLING_METHODS.map(method => (
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
            {method.value === 'credits' && <CreditCardIcon className='h-3.5 w-3.5' />}
            {method.label}
            {method.badge && (
              <Badge variant='secondary' className='text-[10px] px-1.5 py-0 h-4 font-semibold text-emerald-700 bg-emerald-100'>
                {method.badge}
              </Badge>
            )}
          </button>
        ))}
      </div>

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
          {plans.map(plan => {
            const isPopular = plan.name === 'Premium'
            const isCurrent = false // TODO: compare against user's active plan name once available in entitlement summary
            const highlights = PLAN_HIGHLIGHTS[plan.name] ?? []
            const isSelecting = selectingPlanId === plan.id && isPending

            return (
              <Card
                key={plan.id}
                className={cn(
                  'relative flex flex-col transition-shadow',
                  isPopular && 'border-primary shadow-md shadow-primary/10',
                  isCurrent && 'border-muted-foreground/30',
                )}
              >
                {isPopular && (
                  <div className='absolute -top-3 left-1/2 -translate-x-1/2'>
                    <Badge className='bg-primary text-primary-foreground text-[10px] px-2.5 py-0.5'>Most popular</Badge>
                  </div>
                )}

                <CardHeader className='pb-3'>
                  <CardTitle className='text-lg'>{plan.name}</CardTitle>
                  <CardDescription className='text-xs leading-relaxed'>{plan.description}</CardDescription>
                </CardHeader>

                <CardContent className='flex-1 space-y-4'>
                  {/* Price display */}
                  <div>
                    <p className='text-3xl font-bold tracking-tight'>{getDisplayPrice(plan, billingMethod)}</p>
                    {billingMethod === 'annual' && plan.monthlyPrice > 0 && <p className='text-xs text-muted-foreground mt-0.5'>{getAnnualTotal(plan)}</p>}
                    {billingMethod === 'monthly' && plan.monthlyPrice > 0 && <p className='text-xs text-muted-foreground mt-0.5'>per month</p>}
                    {billingMethod === 'credits' && <p className='text-xs text-muted-foreground mt-0.5'>1 credit = 1 transaction</p>}
                  </div>

                  <p className='text-xs text-muted-foreground'>
                    {PlanEngine.formatTxAllowance(plan.includedTxPerMonth)}
                    {billingMethod !== 'credits' ? ' included' : ''}
                  </p>

                  <Separator />

                  {/* Feature highlights */}
                  <ul className='space-y-2'>
                    {highlights.map(h => (
                      <li key={h.text} className='flex items-center gap-2 text-xs text-muted-foreground'>
                        <span className='text-primary shrink-0'>{h.icon}</span>
                        {h.text}
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter className='pt-4'>
                  {isCurrent ? (
                    <Button className='w-full' variant='outline' disabled>
                      Current plan
                    </Button>
                  ) : (
                    <Button className='w-full' variant={isPopular ? 'default' : 'outline'} disabled={isPending} onClick={() => handleSelectPlan(plan)}>
                      {isSelecting ? 'Redirecting…' : `Get ${plan.name}`}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}

      {/* Custom plan CTA */}
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

      {/* Billing method explainer */}
      {billingMethod === 'credits' && (
        <p className='text-xs text-muted-foreground text-center'>
          Credits are prepaid transactions. Buy a bundle, use them at your own pace — no monthly commitment. Your plan's feature set is determined by the tier
          you select above.
        </p>
      )}
      {billingMethod === 'annual' && (
        <p className='text-xs text-muted-foreground text-center'>
          Annual billing locks in 20% savings. Billed as a single upfront payment. Cancel before renewal for a prorated refund.
        </p>
      )}
    </div>
  )
}
