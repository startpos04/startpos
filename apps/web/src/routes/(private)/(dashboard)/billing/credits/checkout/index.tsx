/**
 * /billing/credits/checkout
 *
 * Branch credit package checkout page.
 * Two-column layout matching /business/subscription/checkout:
 *   Left  — Payment method selector + inline form
 *   Right — Package summary
 *
 * Search params:
 *   packageId — required, e.g. '50-credits'
 */

import { Button } from '@platform/components/ui/button'
import { Card, CardContent } from '@platform/components/ui/card'
import { Input } from '@platform/components/ui/input'
import { Label } from '@platform/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@platform/components/ui/select'
import { Textarea } from '@platform/components/ui/textarea'
import { cn } from '@platform/lib/utils'
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe, type StripeCardElementOptions } from '@stripe/stripe-js'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate, useSearch } from '@tanstack/react-router'
import { AlertCircle, ArrowLeftIcon, Banknote, CheckCircle, CheckIcon, CreditCard, InfoIcon, Loader2, ShieldCheck, UploadIcon, Zap } from 'lucide-react'
import { type FormEvent, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { getBranchCreditPackageById } from '@/lib/billing/credit-packages'
import { paymentProviderRegistry } from '@/lib/billing/payment-provider-registry'
import { purchaseBranchCreditsEmbedded, submitManualCreditPayment } from '@/lib/server-fn/purchase-branch-credits-embedded'

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/(private)/(dashboard)/billing/credits/checkout/')({
  validateSearch: (s: Record<string, unknown>) => ({
    packageId: (s['packageId'] as string) ?? '',
  }),
  component: CreditCheckoutPage,
})

// ---------------------------------------------------------------------------
// Package ID mapping
// ---------------------------------------------------------------------------
const PKG_ID_MAP: Record<string, string> = {
  '10-credits': 'branch_credits_10',
  '50-credits': 'branch_credits_50',
  '100-credits': 'branch_credits_100',
  '500-credits': 'branch_credits_500',
  '1000-credits': 'branch_credits_1000',
}

// ---------------------------------------------------------------------------
// Stripe card form
// ---------------------------------------------------------------------------
function StripeCardForm({ packageId, onSuccess }: { packageId: string; onSuccess: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [name, setName] = useState('')
  const [saveCard, setSaveCard] = useState(false)
  const [cardComplete, setCardComplete] = useState(false)
  const [cardError, setCardError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  const pkg = getBranchCreditPackageById(packageId)

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const cardOptions: StripeCardElementOptions = {
    style: {
      base: {
        fontSize: '15px',
        color: isDark ? '#f9fafb' : '#111827',
        fontFamily: 'Inter, system-ui, sans-serif',
        '::placeholder': { color: isDark ? '#6b7280' : '#9ca3af' },
        iconColor: isDark ? '#9ca3af' : '#6b7280',
        backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
      },
      invalid: { color: isDark ? '#f87171' : '#ef4444', iconColor: isDark ? '#f87171' : '#ef4444' },
    },
    hidePostalCode: true,
  }

  const stripeKeyMissing = !import.meta.env['VITE_STRIPE_PUBLIC_KEY']
  if (stripeKeyMissing) {
    return (
      <div className='flex flex-col items-center gap-3 py-8 text-center'>
        <CreditCard className='h-8 w-8 text-muted-foreground' />
        <p className='text-sm font-medium'>Stripe not configured</p>
        <p className='text-xs text-muted-foreground'>Use Manual Payment (GCash / Bank Transfer) instead.</p>
      </div>
    )
  }

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

      const result = await purchaseBranchCreditsEmbedded({
        data: {
          // biome-ignore lint/suspicious/noExplicitAny: flexibility required
          packageId: PKG_ID_MAP[packageId] as any,
          paymentMethodId: paymentMethod.id,
          saveCard,
        },
      })

      if (!result.success) {
        toast.error(result.error ?? 'Purchase failed')
        setProcessing(false)
        return
      }

      if (result.requiresAction && result.clientSecret) {
        const { error: confirmError } = await stripe.confirmCardPayment(result.clientSecret)
        if (confirmError) throw new Error(confirmError.message ?? 'Payment confirmation failed')
      }

      toast.success(`${pkg?.credits ?? ''} credits added!`, {
        description: 'Your credit balance has been updated.',
      })
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
        <span className='text-sm'>Save card for future purchases</span>
      </label>

      <div className='flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50 p-3'>
        <ShieldCheck className='h-4 w-4 text-blue-600 shrink-0 mt-0.5' />
        <p className='text-xs text-blue-800 dark:text-blue-300 leading-relaxed'>Powered by Stripe. Your card is encrypted and never stored on our servers.</p>
      </div>

      <Button type='submit' className='w-full' size='lg' disabled={!canSubmit}>
        {processing ? (
          <>
            <Loader2 className='mr-2 h-4 w-4 animate-spin' /> Processing…
          </>
        ) : (
          <>
            <CreditCard className='mr-2 h-4 w-4' /> Pay {pkg?.price ?? ''}
          </>
        )}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Manual payment form
// ---------------------------------------------------------------------------
function ManualForm({ packageId, onSuccess }: { packageId: string; onSuccess: () => void }) {
  const pkg = getBranchCreditPackageById(packageId)
  const [paymentMethod, setPaymentMethod] = useState<'GCASH' | 'BANK_TRANSFER' | 'MAYA'>('GCASH')
  const [referenceNo, setReferenceNo] = useState('')
  const [notes, setNotes] = useState('')
  const [proofImage, setProofImage] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)

  const manualConfig = paymentProviderRegistry.getConfig('manual')

  const mutation = useMutation({
    mutationFn: submitManualCreditPayment,
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
        // biome-ignore lint/suspicious/noExplicitAny: flexibility required
        packageId: PKG_ID_MAP[packageId] as any,
        paymentMethod,
        referenceNo: referenceNo.trim() || undefined,
        notes: notes.trim() || undefined,
        proofImageUrl: proofImage,
      },
    })
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      {manualConfig && (
        <div className='rounded-lg bg-muted/60 border p-3 text-sm space-y-1'>
          <p className='font-medium'>Payment instructions</p>
          <p>
            <span className='text-muted-foreground'>Account name: </span>
            {(manualConfig.config['accountName'] as string | undefined) ?? '—'}
          </p>
          <p>
            <span className='text-muted-foreground'>Account number: </span>
            {(manualConfig.config['accountNumber'] as string | undefined) ?? '—'}
          </p>
          {manualConfig.config['paymentInstructions'] ? (
            <p className='text-muted-foreground text-xs pt-1'>{manualConfig.config['paymentInstructions'] as string}</p>
          ) : null}
        </div>
      )}

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

      <div className='space-y-1.5'>
        <Label htmlFor='refNo'>
          Reference number <span className='text-muted-foreground font-normal text-xs'>(optional)</span>
        </Label>
        <Input id='refNo' value={referenceNo} onChange={e => setReferenceNo(e.target.value)} placeholder='Transaction / confirmation number' />
      </div>

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
              <p className='text-xs text-muted-foreground'>{imageFile?.name} — click to replace</p>
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

      <div className='space-y-1.5'>
        <Label htmlFor='notes'>
          Notes <span className='text-muted-foreground font-normal text-xs'>(optional)</span>
        </Label>
        <Textarea id='notes' value={notes} onChange={e => setNotes(e.target.value)} placeholder='Any additional details…' rows={2} />
      </div>

      <div className='flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 p-3'>
        <InfoIcon className='h-4 w-4 text-amber-600 shrink-0 mt-0.5' />
        <p className='text-xs text-amber-800 dark:text-amber-300 leading-relaxed'>
          Your payment will be reviewed within 24 hours. Credits will be added once approved.
        </p>
      </div>

      <Button type='submit' className='w-full' size='lg' disabled={!proofImage || mutation.isPending}>
        {mutation.isPending ? (
          <>
            <Loader2 className='mr-2 h-4 w-4 animate-spin' /> Submitting…
          </>
        ) : (
          <>
            <Banknote className='mr-2 h-4 w-4' /> Submit payment — {pkg?.price ?? ''}
          </>
        )}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Package summary (right column)
// ---------------------------------------------------------------------------
function PackageSummary({ packageId }: { packageId: string }) {
  const pkg = getBranchCreditPackageById(packageId)
  if (!pkg) return null

  return (
    <div className='space-y-5'>
      <div>
        <p className='text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1'>Selected package</p>
        <div className='flex items-center gap-2'>
          <Zap className='h-6 w-6 text-amber-500 shrink-0' />
          <div>
            <h2 className='text-2xl font-bold'>{pkg.credits} Credits</h2>
            <p className='text-sm text-muted-foreground mt-0.5'>{pkg.description}</p>
          </div>
        </div>
      </div>

      <div className='rounded-lg bg-muted/50 border divide-y text-sm'>
        <div className='flex justify-between px-3 py-2.5'>
          <span className='text-muted-foreground'>Credits</span>
          <span className='font-medium'>{pkg.credits}</span>
        </div>
        <div className='flex justify-between px-3 py-2.5'>
          <span className='text-muted-foreground'>Price per credit</span>
          <span className='font-medium'>₱{pkg.pricePerCredit.toFixed(2)}</span>
        </div>
        <div className='flex justify-between px-3 py-2.5 font-semibold'>
          <span>Due today</span>
          <span className='text-primary text-lg'>{pkg.price}</span>
        </div>
      </div>

      <div className='space-y-1.5'>
        {['One-time purchase', 'Instant credit (card)', 'No expiry on credits'].map(b => (
          <span key={b} className='flex items-center gap-1.5 text-xs text-muted-foreground'>
            <CheckIcon className='h-3.5 w-3.5 text-primary' /> {b}
          </span>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
function CreditCheckoutPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { packageId } = useSearch({ from: '/(private)/(dashboard)/billing/credits/checkout/' })
  const [paymentType, setPaymentType] = useState<'stripe' | 'manual'>('stripe')

  const pkg = getBranchCreditPackageById(packageId)

  const stripePromise = useMemo(() => {
    const key = import.meta.env['VITE_STRIPE_PUBLIC_KEY']
    if (!key) return null
    return loadStripe(key).catch(err => {
      console.error('[Stripe] Failed to load:', err)
      return null
    })
  }, [])

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['branch-credit-balance'] })
    navigate({ to: '/billing' })
  }

  if (!packageId || !pkg) {
    return (
      <div className='flex flex-col items-center justify-center py-24 gap-4'>
        <p className='text-muted-foreground'>No package selected.</p>
        <Button asChild variant='outline'>
          <Link to='/billing'>Back to billing</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className='w-full px-4 pb-6 space-y-5'>
      {/* Header */}
      <div className='flex items-center gap-3'>
        <Button variant='ghost' size='icon' asChild className='shrink-0'>
          <Link to='/billing'>
            <ArrowLeftIcon className='h-4 w-4' />
          </Link>
        </Button>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Purchase Credits</h1>
          <p className='text-sm text-muted-foreground'>Add transaction credits for your branch</p>
        </div>
      </div>

      {/* Two-column layout — left=payment, right=summary */}
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
                  <p className='text-[11px] text-muted-foreground mt-0.5'>Visa, Mastercard</p>
                  <p className='text-[11px] text-green-600 mt-1 font-medium'>Instant</p>
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
                  <p className='text-[11px] text-muted-foreground mt-0.5'>Manual transfer</p>
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
                    <StripeCardForm packageId={packageId} onSuccess={handleSuccess} />
                  </Elements>
                ) : (
                  <div className='flex flex-col items-center gap-3 py-8 text-center'>
                    <CreditCard className='h-7 w-7 text-muted-foreground' />
                    <p className='text-sm text-muted-foreground'>
                      Add <code className='bg-muted px-1 rounded text-[11px]'>VITE_STRIPE_PUBLIC_KEY</code> to .env to enable card payments.
                    </p>
                  </div>
                )
              ) : (
                <ManualForm packageId={packageId} onSuccess={handleSuccess} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column — package summary */}
        <div className='xl:col-span-2'>
          <Card>
            <CardContent className='pt-5 pb-5'>
              <PackageSummary packageId={packageId} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
