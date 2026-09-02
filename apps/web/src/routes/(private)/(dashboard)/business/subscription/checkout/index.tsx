/**
 * /business/subscription/checkout
 *
 * Unified subscription checkout page.
 *
 * Layout (two-column on desktop, stacked on mobile):
 *   Left  â€” Order summary (plan, billing toggle, price, what's included)
 *   Right â€” Payment method selector + inline payment form
 *
 * Search params:
 *   planId   â€” required, SubscriptionPlan.id
 *   interval â€” optional, 'monthly' | 'annual', defaults to 'monthly'
 */

import { Badge } from '@platform/components/ui/badge'
import { Button } from '@platform/components/ui/button'
import { Card, CardContent } from '@platform/components/ui/card'
import { Input } from '@platform/components/ui/input'
import { Label } from '@platform/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@platform/components/ui/select'
import { Separator } from '@platform/components/ui/separator'
import { Textarea } from '@platform/components/ui/textarea'
import { cn } from '@platform/lib/utils'
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe, type StripeCardElementOptions } from '@stripe/stripe-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  AlertCircle,
  ArrowLeftIcon,
  Banknote,
  CheckCircle,
  CheckIcon,
  ClockIcon,
  CreditCard,
  InfoIcon,
  Loader2,
  ShieldCheck,
  SparklesIcon,
  UploadIcon,
  ZapIcon,
} from 'lucide-react'
import { type FormEvent, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { paymentProviderRegistry } from '@/lib/billing/payment-provider-registry'
import { createStripeSubscription } from '@/lib/server-fn/create-stripe-subscription'
import { fetchPlans, type PlanWithEntitlements } from '@/lib/server-fn/fetch-plans'
import { getPendingManualPayment } from '@/lib/server-fn/get-pending-manual-payment'
import { getSubscriptionStatus } from '@/lib/server-fn/get-subscription-status'
import { submitManualPayment } from '@/lib/server-fn/submit-manual-payment'

// ---------------------------------------------------------------------------
// Stripe setup
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/(private)/(dashboard)/business/subscription/checkout/')({
  validateSearch: (s: Record<string, unknown>) => ({
    planId: (s['planId'] as string) ?? '',
    interval: (s['interval'] as 'monthly' | 'annual') === 'annual' ? 'annual' : 'monthly',
  }),
  component: CheckoutPage,
})

// ---------------------------------------------------------------------------
// Price helpers
// ---------------------------------------------------------------------------

const PLAN_DETAILS: Record<string, { tagline: string; features: string[] }> = {
  Basic: {
    tagline: 'Everything a solo operator needs.',
    features: ['1,000 transactions / month', '1 employee account', '1 branch', 'POS checkout & payments', 'Product catalogue & variants', 'Customer directory'],
  },
  Premium: {
    tagline: 'For growing teams that need more.',
    features: ['Everything in Basic', '5,000 transactions / month', 'Up to 3 branches', 'Inventory adjustments & transfers', 'Sales & inventory reports'],
  },
  Enterprise: {
    tagline: 'For multi-location operations.',
    features: ['Everything in Premium', '10,000 transactions / month', 'Up to 5 branches', 'Supplier & purchase order management', 'Priority support'],
  },
}

function fmt(cents: number) {
  return `â‚±${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
}

function annualTotal(plan: PlanWithEntitlements) {
  return plan.annualPrice ?? Math.round(plan.monthlyPrice * 0.8 * 12)
}

function savingsPct(plan: PlanWithEntitlements) {
  const full = plan.monthlyPrice * 12
  const disc = annualTotal(plan)
  const saved = full - disc
  if (saved <= 0) return null
  return { saved, pct: Math.round((saved / full) * 100) }
}

// ---------------------------------------------------------------------------
// Order summary (left column)
// ---------------------------------------------------------------------------

function OrderSummary({
  plan,
  interval,
  manualPeriods,
  paymentType,
}: {
  plan: PlanWithEntitlements
  interval: 'monthly' | 'annual'
  manualPeriods: number
  paymentType: 'stripe' | 'manual'
}) {
  const details = PLAN_DETAILS[plan.name]
  const sav = savingsPct(plan)

  const dueNow = interval === 'annual' ? annualTotal(plan) : paymentType === 'manual' ? plan.monthlyPrice * manualPeriods : plan.monthlyPrice

  return (
    <div className='space-y-5'>
      {/* Plan header */}
      <div>
        <p className='text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1'>Selected plan</p>
        <h2 className='text-2xl font-bold'>{plan.name}</h2>
        {details && <p className='text-sm text-muted-foreground mt-1'>{details.tagline}</p>}
      </div>

      {/* Billing interval â€” read only, chosen on plans page */}
      <div className='flex items-center justify-between rounded-lg bg-muted/50 border px-3 py-2.5'>
        <div className='flex items-center gap-2 text-sm'>
          {interval === 'annual' ? <SparklesIcon className='h-3.5 w-3.5 text-primary' /> : <ZapIcon className='h-3.5 w-3.5 text-primary' />}
          <span className='font-medium capitalize'>{interval} billing</span>
          {interval === 'annual' && sav && (
            <Badge variant='secondary' className='text-[10px] px-1 py-0 h-4 text-emerald-700 bg-emerald-100'>
              -{sav.pct}%
            </Badge>
          )}
        </div>
        <Link to='/business/subscription/plans' className='text-xs text-muted-foreground underline-offset-2 hover:underline'>
          Change
        </Link>
      </div>

      {interval === 'annual' && (
        <p className='text-xs text-muted-foreground -mt-3'>
          Billed as {fmt(annualTotal(plan))} once per year
          {sav ? ` â€” saves ${fmt(sav.saved)}` : ''}
        </p>
      )}

      <Separator />

      {/* Price summary */}
      <div className='space-y-1.5'>
        <div className='flex items-center justify-between text-sm'>
          <span className='text-muted-foreground'>
            {plan.name} ({interval === 'annual' ? '1 year' : `${manualPeriods > 1 && paymentType === 'manual' ? `${manualPeriods} months` : '1 month'}`})
          </span>
          <span>{fmt(dueNow)}</span>
        </div>
        <div className='flex items-center justify-between font-semibold pt-1.5 border-t'>
          <span>Due today</span>
          <span className='text-primary text-lg'>{fmt(dueNow)}</span>
        </div>
      </div>

      <Separator />

      {/* Features */}
      {details && (
        <div className='space-y-2'>
          <p className='text-[11px] font-medium text-muted-foreground uppercase tracking-wider'>What's included</p>
          <ul className='space-y-1.5'>
            {details.features.map(f => (
              <li key={f} className='flex items-start gap-2 text-sm'>
                <CheckIcon className='h-3.5 w-3.5 text-primary shrink-0 mt-0.5' />
                <span className='text-muted-foreground leading-snug'>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Trust badges */}
      <div className='flex flex-wrap gap-1.5 pt-1'>
        {['Cancel any time', 'Secure checkout', 'PCI compliant'].map(b => (
          <span key={b} className='flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded-full'>
            <ShieldCheck className='h-3 w-3' />
            {b}
          </span>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stripe card form
// ---------------------------------------------------------------------------

function StripeCardForm({ planId, interval, onSuccess }: { planId: string; interval: 'monthly' | 'annual'; onSuccess: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [name, setName] = useState('')
  const [saveCard, setSaveCard] = useState(true)
  const [cardComplete, setCardComplete] = useState(false)
  const [cardError, setCardError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  // Resolve card element colors based on actual theme at render time
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const cardOptions: StripeCardElementOptions = {
    style: {
      base: {
        fontSize: '15px',
        color: isDark ? '#f9fafb' : '#111827',
        fontFamily: 'Inter, system-ui, sans-serif',
        '::placeholder': { color: isDark ? '#6b7280' : '#9ca3af' },
        iconColor: isDark ? '#9ca3af' : '#6b7280',
        backgroundColor: 'transparent',
      },
      invalid: { color: isDark ? '#f87171' : '#ef4444', iconColor: isDark ? '#f87171' : '#ef4444' },
    },
    hidePostalCode: true,
  }

  // Stripe not configured â€” show setup notice only when key is definitively absent
  const stripeKeyMissing = !import.meta.env['VITE_STRIPE_PUBLIC_KEY']
  if (stripeKeyMissing) {
    return (
      <div className='flex flex-col items-center justify-center gap-3 py-8 text-center'>
        <CreditCard className='h-8 w-8 text-muted-foreground' />
        <div>
          <p className='text-sm font-medium'>Stripe not configured</p>
          <p className='text-xs text-muted-foreground mt-1'>
            Add <code className='bg-muted px-1 rounded text-[11px]'>VITE_STRIPE_PUBLIC_KEY</code> to your{' '}
            <code className='bg-muted px-1 rounded text-[11px]'>.env</code> and rebuild.
          </p>
        </div>
        <p className='text-xs text-muted-foreground'>
          Use <strong>Manual Payment</strong> (GCash / Bank Transfer) instead.
        </p>
      </div>
    )
  }

  // Stripe still loading
  if (!stripe) {
    return (
      <div className='flex items-center justify-center py-8'>
        <Loader2 className='h-5 w-5 animate-spin text-muted-foreground' />
      </div>
    )
  }

  const canSubmit = !processing && !!stripe && cardComplete && name.trim().length > 0

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setProcessing(true)

    try {
      const cardElement = elements.getElement(CardElement)
      if (!cardElement) throw new Error('Card element not found')

      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
        billing_details: { name: name.trim() },
      })

      if (pmError) {
        toast.error(pmError.message ?? 'Card validation failed')
        setProcessing(false)
        return
      }

      const result = await createStripeSubscription({
        data: { planId, paymentMethodId: paymentMethod.id, billingInterval: interval, saveCard },
      })

      if (!result.success) throw new Error('Subscription creation failed')

      if (result.requiresAction && result.clientSecret) {
        const { error: confirmError } = await stripe.confirmCardPayment(result.clientSecret)
        if (confirmError) throw new Error(confirmError.message ?? 'Payment confirmation failed')
        const status = await getSubscriptionStatus({ data: { subscriptionId: result.subscriptionId } })
        if (!status.success) throw new Error('Could not confirm subscription status')
      }

      toast.success('Subscription activated!')
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Payment failed. Please try again.')
      setProcessing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      <div className='space-y-1.5'>
        <Label htmlFor='cardName'>
          Cardholder name <span className='text-destructive'>*</span>
        </Label>
        <Input id='cardName' placeholder='Juan Dela Cruz' value={name} onChange={e => setName(e.target.value)} disabled={processing} required />
      </div>

      <div className='space-y-1.5'>
        <Label>
          Card details <span className='text-destructive'>*</span>
        </Label>
        <div className='rounded-lg border bg-background px-3 py-3.5 focus-within:ring-1 focus-within:ring-primary transition min-h-[46px]'>
          <CardElement
            options={cardOptions}
            onChange={e => {
              setCardComplete(e.complete)
              setCardError(e.error?.message ?? null)
            }}
          />
        </div>
        {cardError && (
          <p className='flex items-center gap-1.5 text-xs text-destructive'>
            <AlertCircle className='h-3.5 w-3.5' /> {cardError}
          </p>
        )}
        {cardComplete && !cardError && (
          <p className='flex items-center gap-1.5 text-xs text-green-600'>
            <CheckCircle className='h-3.5 w-3.5' /> Card details valid
          </p>
        )}
      </div>

      <label className='flex items-center gap-2 cursor-pointer'>
        <input type='checkbox' className='rounded' checked={saveCard} onChange={e => setSaveCard(e.target.checked)} disabled={processing} />
        <span className='text-sm'>Save card for future payments</span>
      </label>

      <div className='flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50 p-3'>
        <ShieldCheck className='h-4 w-4 text-blue-600 shrink-0 mt-0.5' />
        <p className='text-xs text-blue-800 dark:text-blue-300 leading-relaxed'>Powered by Stripe. Your card is encrypted and never stored on our servers.</p>
      </div>

      <Button type='submit' className='w-full' size='lg' disabled={!canSubmit}>
        {processing ? (
          <>
            <Loader2 className='mr-2 h-4 w-4 animate-spin' /> Processingâ€¦
          </>
        ) : (
          <>
            <CreditCard className='mr-2 h-4 w-4' /> Pay now
          </>
        )}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Manual payment form
// Only shows period selector when interval = 'monthly'
// Annual = already paying a full year upfront, no period choice needed
// ---------------------------------------------------------------------------

function ManualPaymentForm({
  planId,
  plan,
  interval,
  periods,
  onPeriodsChange,
  onSuccess,
}: {
  planId: string
  plan: PlanWithEntitlements
  interval: 'monthly' | 'annual'
  periods: number
  onPeriodsChange: (p: number) => void
  onSuccess: () => void
}) {
  const [paymentMethod, setPaymentMethod] = useState<'GCASH' | 'BANK_TRANSFER' | 'MAYA'>('GCASH')
  const [referenceNo, setReferenceNo] = useState('')
  const [notes, setNotes] = useState('')
  const [proofImage, setProofImage] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)

  const manualConfig = paymentProviderRegistry.getConfig('manual')

  // Annual: pay the annual price once. Monthly: pay N months upfront.
  const totalCents = interval === 'annual' ? annualTotal(plan) : plan.monthlyPrice * periods

  const mutation = useMutation({
    mutationFn: submitManualPayment,
    onSuccess: result => {
      if (result.success) {
        toast.success('Payment submitted!', { description: result.message })
        onSuccess()
      } else {
        toast.error(result.error ?? 'Submission failed.')
      }
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5 MB')
      return
    }
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = ev => setProofImage(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!proofImage) {
      toast.error('Please upload proof of payment')
      return
    }
    mutation.mutate({
      data: {
        planId,
        amount: totalCents,
        paymentMethod,
        // Annual = 12 months in one payment; monthly = selected periods
        periodsAdvancePaid: interval === 'annual' ? 1 : periods,
        referenceNo: referenceNo.trim() || undefined,
        notes: notes.trim() || undefined,
        proofImageUrl: proofImage,
      },
    })
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      {/* Payment instructions */}
      {manualConfig && (
        <div className='rounded-lg bg-muted/60 border p-3 text-sm space-y-1'>
          <p className='font-medium'>Payment instructions</p>
          <p>
            <span className='text-muted-foreground'>Account name: </span>
            {String(manualConfig.config.accountName ?? 'â€”')}
          </p>
          <p>
            <span className='text-muted-foreground'>Account number: </span>
            {String(manualConfig.config.accountNumber ?? 'â€”')}
          </p>
          {manualConfig.config.paymentInstructions && <p className='text-muted-foreground text-xs pt-1'>{String(manualConfig.config.paymentInstructions)}</p>}
        </div>
      )}

      {/* Period selector â€” monthly only */}
      {interval === 'monthly' && (
        <div className='space-y-1.5'>
          <Label>
            Months to pay in advance
            <span className='ml-1 text-muted-foreground font-normal text-xs'>(max 3)</span>
          </Label>
          <div className='flex gap-2'>
            {[1, 2, 3].map(p => (
              <button
                key={p}
                type='button'
                onClick={() => onPeriodsChange(p)}
                className={cn(
                  'flex-1 rounded-lg border py-2 text-sm font-medium transition-all',
                  periods === p ? 'border-primary bg-primary/5 ring-1 ring-primary text-primary' : 'border-border hover:border-primary/40',
                )}
              >
                {p} {p === 1 ? 'month' : 'months'}
              </button>
            ))}
          </div>
          <p className='text-xs text-muted-foreground'>
            Total: <strong>{fmt(totalCents)}</strong>
            {periods > 1 && ` â€” covers ${periods} billing periods`}
          </p>
        </div>
      )}

      {/* Annual notice */}
      {interval === 'annual' && (
        <div className='rounded-lg bg-muted/50 border px-3 py-2.5 text-sm flex items-center justify-between'>
          <span className='text-muted-foreground'>Annual payment (1 year)</span>
          <span className='font-semibold'>{fmt(totalCents)}</span>
        </div>
      )}

      {/* Payment method */}
      <div className='space-y-1.5'>
        <Label>
          Payment method <span className='text-destructive'>*</span>
        </Label>
        <Select value={paymentMethod} onValueChange={(v: 'GCASH' | 'BANK_TRANSFER' | 'MAYA') => setPaymentMethod(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='GCASH'>GCash</SelectItem>
            <SelectItem value='BANK_TRANSFER'>Bank Transfer</SelectItem>
            <SelectItem value='MAYA'>Maya</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Reference number */}
      <div className='space-y-1.5'>
        <Label htmlFor='refNo'>
          Reference number
          <span className='ml-1 text-muted-foreground font-normal text-xs'>(optional)</span>
        </Label>
        <Input id='refNo' value={referenceNo} onChange={e => setReferenceNo(e.target.value)} placeholder='Transaction / confirmation number' />
      </div>

      {/* Proof upload */}
      <div className='space-y-1.5'>
        <Label>
          Payment screenshot <span className='text-destructive'>*</span>
        </Label>
        <label
          htmlFor='proof-upload'
          className='flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 p-5 text-center cursor-pointer hover:border-primary/40 transition'
        >
          {proofImage ? (
            <div className='space-y-1.5 w-full'>
              <img src={proofImage} alt='proof' className='max-h-36 mx-auto rounded-lg object-contain' />
              <p className='text-xs text-muted-foreground'>{imageFile?.name} â€” click to replace</p>
            </div>
          ) : (
            <>
              <UploadIcon className='h-7 w-7 text-muted-foreground mb-1.5' />
              <p className='text-sm font-medium'>Upload payment screenshot</p>
              <p className='text-xs text-muted-foreground mt-0.5'>PNG, JPG up to 5 MB</p>
            </>
          )}
          <input id='proof-upload' type='file' accept='image/*' className='hidden' onChange={handleImage} />
        </label>
      </div>

      {/* Notes */}
      <div className='space-y-1.5'>
        <Label htmlFor='notes'>
          Notes
          <span className='ml-1 text-muted-foreground font-normal text-xs'>(optional)</span>
        </Label>
        <Textarea id='notes' value={notes} onChange={e => setNotes(e.target.value)} placeholder='Any additional detailsâ€¦' rows={2} />
      </div>

      <div className='flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 p-3'>
        <InfoIcon className='h-4 w-4 text-amber-600 shrink-0 mt-0.5' />
        <p className='text-xs text-amber-800 dark:text-amber-300 leading-relaxed'>
          Your payment will be reviewed within 24 hours. You'll receive a notification once approved.
        </p>
      </div>

      <Button type='submit' className='w-full' size='lg' disabled={!proofImage || mutation.isPending}>
        {mutation.isPending ? (
          <>
            <Loader2 className='mr-2 h-4 w-4 animate-spin' /> Submittingâ€¦
          </>
        ) : (
          <>
            <Banknote className='mr-2 h-4 w-4' /> Submit payment
          </>
        )}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Checkout page
// ---------------------------------------------------------------------------

function CheckoutPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { planId, interval: initialInterval } = useSearch({ from: '/(private)/(dashboard)/business/subscription/checkout/' })

  const [interval] = useState<'monthly' | 'annual'>(initialInterval)

  // Initialize stripePromise client-side only so import.meta.env is available
  const stripePromise = useMemo(() => {
    const key = import.meta.env['VITE_STRIPE_PUBLIC_KEY']
    if (!key) return null
    return loadStripe(key)
  }, [])
  const [paymentType, setPaymentType] = useState<'stripe' | 'manual'>('stripe')
  const [manualPeriods, setManualPeriods] = useState(1)

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: fetchPlans,
  })

  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['pending-manual-payment'],
    queryFn: () => getPendingManualPayment(),
  })

  const hasPending = pendingData?.hasPending ?? false
  const pendingPayment = pendingData?.payment ?? null

  const plan = plans.find(p => p.id === planId)

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['plans'] })
    queryClient.invalidateQueries({ queryKey: ['pending-manual-payment'] })
    navigate({ to: '/business/subscription' })
  }

  if (!planId) {
    return (
      <div className='flex flex-col items-center justify-center py-24 gap-4'>
        <p className='text-muted-foreground'>No plan selected.</p>
        <Button asChild variant='outline'>
          <Link to='/business/subscription/plans'>Back to plans</Link>
        </Button>
      </div>
    )
  }

  if (isLoading || pendingLoading) {
    return (
      <div className='flex items-center justify-center py-24'>
        <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
      </div>
    )
  }

  if (!plan) {
    return (
      <div className='flex flex-col items-center justify-center py-24 gap-4'>
        <p className='text-muted-foreground'>Plan not found.</p>
        <Button asChild variant='outline'>
          <Link to='/business/subscription/plans'>Back to plans</Link>
        </Button>
      </div>
    )
  }

  // --- Locked state: pending payment in review ---
  if (hasPending && pendingPayment) {
    return (
      <div className='w-full px-4 pb-6 space-y-5'>
        {/* Header */}
        <div className='flex items-center gap-3'>
          <Button variant='ghost' size='icon' asChild className='shrink-0'>
            <Link to='/business/subscription/plans'>
              <ArrowLeftIcon className='h-4 w-4' />
            </Link>
          </Button>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Checkout</h1>
            <p className='text-sm text-muted-foreground'>Review your plan and complete payment</p>
          </div>
        </div>

        <div className='max-w-lg mx-auto pt-8 space-y-6'>
          {/* Lock icon + heading */}
          <div className='flex flex-col items-center text-center gap-3'>
            <div className='rounded-full bg-amber-100 dark:bg-amber-950/40 p-4'>
              <ClockIcon className='h-8 w-8 text-amber-600' />
            </div>
            <div>
              <h2 className='text-lg font-semibold'>Payment under review</h2>
              <p className='text-sm text-muted-foreground mt-1'>You can't submit a new payment while one is being reviewed.</p>
            </div>
          </div>

          {/* Payment details card */}
          <div className='rounded-lg border bg-muted/40 divide-y text-sm'>
            <div className='flex items-center justify-between px-4 py-3'>
              <span className='text-muted-foreground'>Amount submitted</span>
              <span className='font-semibold'>â‚±{((pendingPayment.amount ?? 0) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className='flex items-center justify-between px-4 py-3'>
              <span className='text-muted-foreground'>Periods covered</span>
              <span className='font-semibold'>
                {pendingPayment.periodsAdvancePaid} {pendingPayment.periodsAdvancePaid === 1 ? 'month' : 'months'}
              </span>
            </div>
            {pendingPayment.providerReference && (
              <div className='flex items-center justify-between px-4 py-3'>
                <span className='text-muted-foreground'>Reference no.</span>
                <span className='font-mono text-xs'>{pendingPayment.providerReference}</span>
              </div>
            )}
            <div className='flex items-center justify-between px-4 py-3'>
              <span className='text-muted-foreground'>Submitted on</span>
              <span className='font-semibold'>
                {new Date(pendingPayment.createdAt).toLocaleDateString('en-PH', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
          </div>

          <div className='flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 p-3'>
            <InfoIcon className='h-4 w-4 text-amber-600 shrink-0 mt-0.5' />
            <p className='text-xs text-amber-800 dark:text-amber-400 leading-relaxed'>
              Our team reviews payments within 24 hours. You'll receive a notification once approved or if further action is needed.
            </p>
          </div>

          <Button asChild variant='outline' className='w-full'>
            <Link to='/business/subscription'>Back to subscription</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className='w-full px-4 pb-6 space-y-5'>
      {/* Header */}
      <div className='flex items-center gap-3'>
        <Button variant='ghost' size='icon' asChild className='shrink-0'>
          <Link to='/business/subscription/plans'>
            <ArrowLeftIcon className='h-4 w-4' />
          </Link>
        </Button>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Checkout</h1>
          <p className='text-sm text-muted-foreground'>Review your plan and complete payment</p>
        </div>
      </div>

      {/* Two-column layout â€” left=payment, right=summary */}
      <div className='grid grid-cols-1 xl:grid-cols-5 gap-5 items-start'>
        <div className='xl:col-span-3 space-y-4'>
          {/* Payment type selector */}
          <div>
            <p className='text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2'>Payment method</p>
            <div className='grid grid-cols-2 gap-3'>
              <button
                type='button'
                onClick={() => setPaymentType('stripe')}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-3 text-left transition-all',
                  paymentType === 'stripe' ? 'border-primary bg-primary/5 ring-2 ring-primary' : 'border-border hover:border-primary/40',
                )}
              >
                <div className='rounded-lg bg-blue-50 dark:bg-blue-950/30 p-1.5 shrink-0'>
                  <CreditCard className='h-4 w-4 text-blue-600' />
                </div>
                <div className='min-w-0 flex-1'>
                  <p className='font-semibold text-sm'>Card</p>
                  <p className='text-[11px] text-muted-foreground mt-0.5 leading-snug'>Visa, Mastercard â€¢ auto-renews</p>
                  <p className='text-[11px] text-green-600 mt-1 font-medium'>Instant activation</p>
                </div>
                <div
                  className={cn(
                    'w-4 h-4 rounded-full border-2 shrink-0 transition-colors mt-0.5',
                    paymentType === 'stripe' ? 'border-primary bg-primary' : 'border-muted-foreground',
                  )}
                >
                  {paymentType === 'stripe' && <CheckIcon className='h-2.5 w-2.5 text-primary-foreground m-px' />}
                </div>
              </button>

              <button
                type='button'
                onClick={() => setPaymentType('manual')}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-3 text-left transition-all',
                  paymentType === 'manual' ? 'border-primary bg-primary/5 ring-2 ring-primary' : 'border-border hover:border-primary/40',
                )}
              >
                <div className='rounded-lg bg-green-50 dark:bg-green-950/30 p-1.5 shrink-0'>
                  <Banknote className='h-4 w-4 text-green-600' />
                </div>
                <div className='min-w-0 flex-1'>
                  <p className='font-semibold text-sm'>GCash / Bank</p>
                  <p className='text-[11px] text-muted-foreground mt-0.5 leading-snug'>
                    {interval === 'monthly' ? 'Manual transfer â€¢ 1â€“3 months' : 'Manual transfer â€¢ 1 year'}
                  </p>
                  <p className='text-[11px] text-amber-600 mt-1 font-medium'>24h review</p>
                </div>
                <div
                  className={cn(
                    'w-4 h-4 rounded-full border-2 shrink-0 transition-colors mt-0.5',
                    paymentType === 'manual' ? 'border-primary bg-primary' : 'border-muted-foreground',
                  )}
                >
                  {paymentType === 'manual' && <CheckIcon className='h-2.5 w-2.5 text-primary-foreground m-px' />}
                </div>
              </button>
            </div>
          </div>

          {/* Inline payment form */}
          <Card>
            <CardContent className='pt-5 pb-5'>
              {paymentType === 'stripe' ? (
                stripePromise ? (
                  <Elements stripe={stripePromise}>
                    <StripeCardForm planId={plan.id} interval={interval} onSuccess={handleSuccess} />
                  </Elements>
                ) : (
                  <div className='flex flex-col items-center gap-3 py-8 text-center'>
                    <CreditCard className='h-7 w-7 text-muted-foreground' />
                    <p className='text-sm font-medium'>Stripe not configured</p>
                    <p className='text-xs text-muted-foreground'>
                      Add <code className='bg-muted px-1 rounded'>VITE_STRIPE_PUBLIC_KEY</code> to .env and rebuild.
                    </p>
                  </div>
                )
              ) : (
                <ManualPaymentForm
                  planId={plan.id}
                  plan={plan}
                  interval={interval}
                  periods={manualPeriods}
                  onPeriodsChange={setManualPeriods}
                  onSuccess={handleSuccess}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right â€” order summary */}
        <div className='xl:col-span-2'>
          <Card>
            <CardContent className='pt-5 pb-5'>
              <OrderSummary plan={plan} interval={interval} manualPeriods={manualPeriods} paymentType={paymentType} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
