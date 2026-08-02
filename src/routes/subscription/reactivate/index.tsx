/**
 * subscription/reactivate/index.tsx
 *
 * /subscription/reactivate — Account Reactivation Shell
 *
 * Accessible to businesses in LONG_TERM_INACTIVE, EXPIRED, or CANCELLED status.
 * This route is the designated escape hatch: it must render without any
 * subscription check (a suspended/inactive business must be able to reach it).
 *
 * Phase 1: UI shell with status context and support contact CTA.
 * Phase 4: Wired to billing provider checkout for actual reactivation payment.
 *
 * Route placement: /subscription/reactivate (outside (private)/(dashboard) so
 * it does NOT inherit the Dashboard sidebar layout — full-page escape hatch).
 */

import { createFileRoute, Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { ArrowLeftIcon, CheckCircle2Icon, CreditCardIcon, GalleryVerticalEndIcon, MailIcon, RefreshCwIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { SubscriptionStatusVO } from '@/lib/billing/value-objects/subscription-status'
import { APP_NAME } from '@/lib/constants'
import { SubscriptionStatus } from '@/lib/entitlement/entitlement-types'
import { cn } from '@/lib/utils'
import { authStore } from '@/store/auth-store'

export const Route = createFileRoute('/subscription/reactivate/')({
  component: ReactivatePage,
})

// ---------------------------------------------------------------------------
// What reactivation restores — shown as a feature checklist
// ---------------------------------------------------------------------------

const RESTORED_FEATURES = [
  'Point of Sale (POS) checkout',
  'Inventory management and receiving',
  'Order management',
  'Task creation and assignment',
  'All data from before the account lapsed',
]

// ---------------------------------------------------------------------------
// ReactivatePage
// ---------------------------------------------------------------------------

function ReactivatePage() {
  const user = useStore(authStore, state => state.user)
  const status = user?.entitlement?.status as SubscriptionStatus | undefined

  const businessName = user?.business?.name ?? 'Your business'

  const isSuspended = status === SubscriptionStatus.SUSPENDED

  return (
    <div className='min-h-screen bg-background flex flex-col'>
      {/* Minimal header — no sidebar */}
      <header className='border-b px-6 py-4 flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <div className='bg-sidebar-primary text-sidebar-primary-foreground flex h-8 w-8 items-center justify-center rounded-lg'>
            <GalleryVerticalEndIcon className='h-4 w-4' />
          </div>
          <span className='font-semibold text-sm'>{APP_NAME}</span>
        </div>
        <Button variant='ghost' size='sm' asChild>
          <Link to='/billing'>
            <ArrowLeftIcon className='h-4 w-4 mr-1.5' />
            Back to Billing
          </Link>
        </Button>
      </header>

      {/* Main content */}
      <main className='flex-1 flex items-center justify-center p-6'>
        <div className='w-full max-w-lg space-y-6'>
          {/* Account status context */}
          <div className='text-center space-y-2'>
            <div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted'>
              <RefreshCwIcon className='h-8 w-8 text-muted-foreground' />
            </div>
            <h1 className='text-2xl font-bold tracking-tight'>Reactivate Your Account</h1>
            <p className='text-muted-foreground text-sm'>{businessName} — restore full access to all your operational features.</p>
            {status && (
              <Badge
                variant='outline'
                className={cn(
                  'mx-auto mt-1 inline-flex items-center gap-1.5 text-xs',
                  SubscriptionStatusVO.toBannerSeverity(status) === 'error' && 'border-destructive/40 text-destructive bg-destructive/5',
                )}
              >
                Current status: {SubscriptionStatusVO.toLabel(status)}
              </Badge>
            )}
          </div>

          {/* Suspended — admin-only resolution */}
          {isSuspended ? (
            <Card className='border-destructive/30'>
              <CardHeader className='pb-3'>
                <CardTitle className='text-base'>Account Suspended</CardTitle>
                <CardDescription>
                  Your account has been suspended by platform administration. Reactivation requires manual review by our support team.
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-3'>
                <p className='text-sm text-muted-foreground'>
                  Please contact support with your business name and the email address on your account. Our team typically responds within one business day.
                </p>
                <Button className='w-full gap-2' asChild>
                  <a href='mailto:support@startpos.app'>
                    <MailIcon className='h-4 w-4' />
                    Contact Support
                  </a>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* What gets restored */}
              <Card>
                <CardHeader className='pb-3'>
                  <CardTitle className='text-base'>What reactivation restores</CardTitle>
                  <CardDescription>All operational features are immediately available once your subscription is active.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className='space-y-2'>
                    {RESTORED_FEATURES.map(feature => (
                      <li key={feature} className='flex items-center gap-2 text-sm'>
                        <CheckCircle2Icon className='h-4 w-4 text-emerald-500 shrink-0' />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Separator />

              {/* Phase 1: CTA shell — Phase 4 wires the actual payment flow */}
              <Card className='border-primary/30 bg-primary/5'>
                <CardHeader className='pb-3'>
                  <CardTitle className='text-base flex items-center gap-2'>
                    <CreditCardIcon className='h-4 w-4 text-primary' />
                    Choose a Plan to Reactivate
                  </CardTitle>
                  <CardDescription>
                    Select a subscription plan and complete payment to restore your account. Payment processing will be available in the next update.
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-3'>
                  {/* Phase 4 placeholder — will be replaced with PricingEngine plan selector */}
                  <div className='rounded-lg border border-dashed border-border p-4 text-center'>
                    <p className='text-sm text-muted-foreground'>
                      Plan selection and checkout coming soon. Contact support to reactivate manually in the meantime.
                    </p>
                  </div>

                  <div className='flex flex-col gap-2'>
                    <Button className='w-full gap-2' disabled>
                      <CreditCardIcon className='h-4 w-4' />
                      Subscribe &amp; Reactivate
                      <span className='ml-auto text-xs opacity-60'>(Phase 4)</span>
                    </Button>
                    <Button variant='outline' className='w-full gap-2' asChild>
                      <a href='mailto:support@startpos.app'>
                        <MailIcon className='h-4 w-4' />
                        Contact Support
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
