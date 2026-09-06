/**
 * gcash-payment-guide.tsx
 *
 * Reusable callout that explains how to pay via GCash through Stripe.
 *
 * GCash works on Stripe via the GCash Mastercard virtual card:
 *   1. Open GCash → tap "Pay Bills" or "GCash Card"
 *   2. Reveal the 16-digit virtual Mastercard number, expiry, and CVV
 *   3. On Stripe checkout, choose "Card" and enter those details
 *   4. GCash will send an OTP — enter it to complete payment
 *
 * The callout starts collapsed so it doesn't clutter the page. A
 * "How to pay with GCash" trigger expands the steps inline. Once
 * dismissed it stays dismissed for the session via localStorage.
 */

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@platform/components/ui/collapsible'
import { ChevronDownIcon, ChevronUpIcon, SmartphoneIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

const DISMISSED_KEY = 'gcash_guide_dismissed'

interface GCashPaymentGuideProps {
  /** When true the guide is always shown and cannot be dismissed (e.g. on a dedicated help page). */
  alwaysVisible?: boolean
  /** Override classname on the outer wrapper. */
  className?: string
}

export function GCashPaymentGuide({ alwaysVisible = false, className }: GCashPaymentGuideProps) {
  const [dismissed, setDismissed] = useState(false)
  const [open, setOpen] = useState(false)

  // Check session storage on mount — avoid showing to users who already read it
  useEffect(() => {
    if (!alwaysVisible && sessionStorage.getItem(DISMISSED_KEY) === '1') {
      setDismissed(true)
    }
  }, [alwaysVisible])

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }

  if (dismissed) return null

  return (
    <div className={`rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-800/60 dark:bg-blue-950/20 px-4 py-3 ${className ?? ''}`}>
      <Collapsible open={open} onOpenChange={setOpen}>
        {/* Trigger row */}
        <div className='flex items-center justify-between gap-3'>
          <div className='flex items-center gap-2.5'>
            {/* GCash-ish color dot + icon */}
            <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500'>
              <SmartphoneIcon className='h-3.5 w-3.5 text-white' />
            </div>
            <div>
              <p className='text-sm font-semibold text-blue-900 dark:text-blue-200 leading-tight'>Paying with GCash?</p>
              <p className='text-xs text-blue-700 dark:text-blue-400 leading-tight mt-0.5'>You can use your GCash virtual card — no physical card needed.</p>
            </div>
          </div>

          <div className='flex items-center gap-2 shrink-0'>
            <CollapsibleTrigger asChild>
              <button
                type='button'
                className='flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-200 transition-colors'
              >
                {open ? (
                  <>
                    Hide steps <ChevronUpIcon className='h-3.5 w-3.5' />
                  </>
                ) : (
                  <>
                    How it works <ChevronDownIcon className='h-3.5 w-3.5' />
                  </>
                )}
              </button>
            </CollapsibleTrigger>

            {!alwaysVisible && (
              <button
                type='button'
                onClick={handleDismiss}
                className='text-xs text-blue-500 hover:text-blue-700 dark:text-blue-500 dark:hover:text-blue-300 transition-colors ml-1'
                aria-label='Dismiss GCash guide'
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Expandable steps */}
        <CollapsibleContent>
          <div className='mt-3 pt-3 border-t border-blue-200 dark:border-blue-800/60 space-y-3'>
            {/* Steps */}
            <ol className='space-y-2.5'>
              {GCASH_STEPS.map((step, i) => (
                <li key={step.label} className='flex items-start gap-3'>
                  <span className='flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white text-[10px] font-bold mt-0.5'>
                    {i + 1}
                  </span>
                  <div>
                    <p className='text-xs font-semibold text-blue-900 dark:text-blue-200 leading-tight'>{step.label}</p>
                    <p className='text-xs text-blue-700 dark:text-blue-400 leading-snug mt-0.5'>{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>

            {/* Note */}
            <div className='rounded-lg bg-blue-100 dark:bg-blue-900/30 px-3 py-2'>
              <p className='text-xs text-blue-800 dark:text-blue-300 leading-relaxed'>
                <span className='font-semibold'>Note:</span> The GCash virtual card is a Mastercard — on Stripe checkout select{' '}
                <span className='font-mono font-semibold'>Card</span> and enter your virtual card number, expiry, and CVV exactly as shown in the GCash app.
                You&apos;ll receive a GCash OTP to confirm the charge.
              </p>
            </div>

            {/* Requirement callout */}
            <div className='flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/20 px-3 py-2'>
              <span className='text-amber-500 text-sm leading-none mt-px'>⚠️</span>
              <p className='text-xs text-amber-800 dark:text-amber-300 leading-relaxed'>
                You need a <span className='font-semibold'>GCash card</span> (virtual or physical) to use this method. If you haven&apos;t activated yours yet,
                open the GCash app → tap <span className='font-mono font-semibold'>GCash Card</span> → follow the activation steps. It takes about 2 minutes.
              </p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

const GCASH_STEPS: Array<{ label: string; detail: string }> = [
  {
    label: 'Open GCash and go to your card',
    detail:
      'Tap "GCash Card" on the home screen (or find it under "Services"). If you haven\'t activated it yet, tap "Get Card" and follow the steps \u2014 it takes about 2 minutes.',
  },
  {
    label: 'Copy your virtual card details',
    detail: 'Tap "Show Card Details" (you\'ll need your MPIN). Note the 16-digit card number, expiry date (MM/YY), and CVV.',
  },
  {
    label: 'Choose \u201cCard\u201d on the Stripe checkout page',
    detail:
      'When Stripe asks for a payment method, select Card \u2014 not GCash directly. Enter the virtual card number, expiry, and CVV from the previous step.',
  },
  {
    label: 'Approve the OTP in GCash',
    detail:
      'GCash will send a 6-digit OTP to your registered mobile number. Enter it on the Stripe page to complete the payment. The charge will deduct from your GCash wallet balance.',
  },
]
