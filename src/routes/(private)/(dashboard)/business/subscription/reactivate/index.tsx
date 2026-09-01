/**
 * subscription/reactivate/index.tsx
 *
 * /subscription/reactivate — Account Reactivation Flow
 *
 * Accessible to businesses in LONG_TERM_INACTIVE, EXPIRED, or CANCELLED status.
 * This route is the designated escape hatch: it must render without any
 * subscription check (a suspended/inactive business must be able to reach it).
 *
 * Features:
 * - Plan selection with pricing display
 * - Billing method selection (monthly/annual/credits)
 * - Full checkout integration for reactivation
 * - Immediate capability restoration upon successful payment
 *
 * Route placement: /subscription/reactivate (outside (private)/(dashboard) so
 * it does NOT inherit the Dashboard sidebar layout — full-page escape hatch).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  CoinsIcon,
  CreditCardIcon,
  GalleryVerticalEndIcon,
  MailIcon,
  RefreshCwIcon,
  SparklesIcon,
  ZapIcon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { BillingModel } from '@/lib/billing/types'
import { canReactivate, SubscriptionStatusVO } from '@/lib/billing/value-objects/subscription-status'
import { APP_NAME } from '@/lib/constants'
import { SubscriptionStatus } from '@/lib/entitlement/entitlement-types'
import { fetchPlans, type PlanWithEntitlements } from '@/lib/server-fn/fetch-plans'
import { reactivateSubscription } from '@/lib/server-fn/reactivate-subscription'
import { cn } from '@/lib/utils'
import { refreshAuthUser } from '@/lib/better-auth/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/business/subscription/reactivate/')({
  component: ReactivatePage,
  beforeLoad: async ({ context }) => {
    // Authentication check - user should be authenticated
    if (!context.user?.id) {
      throw redirect({
        to: '/login',
        search: { redirect: '/business/subscription/reactivate' },
      })
    }

    // Business context check - user must belong to a business
    if (!context.user.business?.id) {
      throw redirect({
        to: '/register/business-setup',
        search: {
          redirect: '/business/subscription/reactivate',
          error: 'Business setup required before reactivation',
        },
      })
    }

    // Subscription status check - must be in a reactivatable status
    const status = context.user.entitlement?.status as SubscriptionStatus | undefined
    if (!status) {
      throw redirect({
        to: '/business/subscription',
        search: {
          error: 'Unable to determine subscription status. Please contact support.',
        },
      })
    }

    // Check if the status allows reactivation
    if (!canReactivate(status)) {
      // Handle different non-reactivatable cases with appropriate redirects
      if (status === SubscriptionStatus.SUSPENDED) {
        throw redirect({
          to: '/business/subscription',
          search: {
            error: 'Your account is suspended. Please contact support to resolve this issue.',
          },
        })
      }

      // Already active statuses should go to billing dashboard
      if (SubscriptionStatusVO.isOperationallyActive(status)) {
        throw redirect({
          to: '/business/subscription',
          search: {
            info: 'Your subscription is already active. Use the billing dashboard to make changes.',
          },
        })
      }

      // Fallback for any other non-reactivatable status
      throw redirect({
        to: '/business/subscription',
        search: {
          error: 'Reactivation is not available for your current subscription status.',
        },
      })
    }

    // All checks passed - allow access to reactivation flow
    return {
      user: context.user,
      reactivatableStatus: status,
    }
  },
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
// Billing method options for reactivation
// ---------------------------------------------------------------------------

type BillingMethod = 'monthly' | 'annual' | 'credits'

const BILLING_METHODS: Array<{ value: BillingMethod; label: string; description: string; icon: React.ReactNode }> = [
  {
    value: 'monthly',
    label: 'Monthly',
    description: 'Billed monthly',
    icon: <ZapIcon className='h-4 w-4' />,
  },
  {
    value: 'annual',
    label: 'Annual',
    description: 'Save 20% with annual billing',
    icon: <SparklesIcon className='h-4 w-4' />,
  },
  {
    value: 'credits',
    label: 'Pay as you go',
    description: '1 credit = 1 transaction',
    icon: <CoinsIcon className='h-4 w-4' />,
  },
]

// ---------------------------------------------------------------------------
// Plan selection dialog
// ---------------------------------------------------------------------------

interface PlanSelectionDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  plans: PlanWithEntitlements[]
  selectedPlan: PlanWithEntitlements | null
  selectedMethod: BillingMethod
  onPlanSelect: (plan: PlanWithEntitlements) => void
  onMethodSelect: (method: BillingMethod) => void
  onConfirm: () => void
  isProcessing: boolean
}

function PlanSelectionDialog({
  open,
  onOpenChange,
  plans,
  selectedPlan,
  selectedMethod,
  onPlanSelect,
  onMethodSelect,
  onConfirm,
  isProcessing,
}: PlanSelectionDialogProps) {
  const getDisplayPrice = (plan: PlanWithEntitlements, method: BillingMethod): string => {
    if (plan.monthlyPrice === 0) return 'Free'
    if (method === 'credits') return 'Pay per TX'
    if (method === 'annual') {
      const annual = plan.annualPrice ?? Math.round(plan.monthlyPrice * 0.8 * 12)
      const perMonth = Math.round(annual / 12)
      return `₱${(perMonth / 100).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`
    }
    return `₱${(plan.monthlyPrice / 100).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Choose a Plan to Reactivate</DialogTitle>
          <DialogDescription>Select a subscription plan and billing method to restore full access to your account.</DialogDescription>
        </DialogHeader>

        <div className='space-y-6'>
          {/* Billing Method Selection */}
          <div className='space-y-3'>
            <h4 className='text-sm font-semibold'>Billing Method</h4>
            <div className='grid grid-cols-1 sm:grid-cols-3 gap-2'>
              {BILLING_METHODS.map(method => (
                <button
                  key={method.value}
                  type='button'
                  onClick={() => onMethodSelect(method.value)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border p-3 text-left transition-all text-sm',
                    'hover:border-primary/60 hover:bg-primary/5',
                    selectedMethod === method.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card',
                  )}
                >
                  {method.icon}
                  <div>
                    <p className='font-medium'>{method.label}</p>
                    <p className='text-xs text-muted-foreground'>{method.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Plan Selection */}
          <div className='space-y-3'>
            <h4 className='text-sm font-semibold'>Select Plan</h4>
            <div className='grid gap-3'>
              {plans
                .filter(p => p.name !== 'Trial')
                .map(plan => (
                  <button
                    key={plan.id}
                    type='button'
                    onClick={() => onPlanSelect(plan)}
                    className={cn(
                      'flex items-center justify-between rounded-lg border p-4 text-left transition-all',
                      'hover:border-primary/60 hover:bg-primary/5',
                      selectedPlan?.id === plan.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card',
                    )}
                  >
                    <div>
                      <p className='font-semibold'>{plan.name}</p>
                      <p className='text-sm text-muted-foreground mt-1'>{plan.includedTxPerMonth?.toLocaleString()} transactions/month, full access</p>
                    </div>
                    <div className='text-right'>
                      <p className='font-bold text-lg tabular-nums text-primary'>{getDisplayPrice(plan, selectedMethod)}</p>
                      {selectedMethod === 'monthly' && plan.monthlyPrice > 0 && <p className='text-xs text-muted-foreground'>/month</p>}
                      {selectedMethod === 'annual' && plan.monthlyPrice > 0 && <p className='text-xs text-muted-foreground'>/month, billed annually</p>}
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={!selectedPlan || isProcessing} className='gap-2'>
            {isProcessing ? (
              'Processing...'
            ) : (
              <>
                <CreditCardIcon className='h-4 w-4' />
                {selectedMethod === 'credits' ? 'Switch to Credits' : 'Proceed to Payment'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// ReactivatePage
// ---------------------------------------------------------------------------

function ReactivatePage() {
  const [showPlanDialog, setShowPlanDialog] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<PlanWithEntitlements | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<BillingMethod>('monthly')

  // Get validated user and status from route context (guaranteed to exist due to beforeLoad checks)
  const { user, reactivatableStatus } = Route.useRouteContext()
  const businessName = user.business?.name ?? 'Your business'

  const queryClient = useQueryClient()

  const { data: plans = [], isLoading: loadingPlans } = useQuery({
    queryKey: ['plans'],
    queryFn: () => fetchPlans(),
  })

  const isSuspended = reactivatableStatus === SubscriptionStatus.SUSPENDED
  const canUserReactivate = canReactivate(reactivatableStatus)

  const reactivateMutation = useMutation({
    mutationFn: () => {
      if (!selectedPlan) throw new Error('No plan selected')

      return reactivateSubscription({
        data: {
          planId: selectedPlan.id,
          billingInterval: selectedMethod === 'annual' ? 'annual' : 'monthly',
          billingModel: selectedMethod === 'credits' ? BillingModel.PREPAID_CREDITS : undefined,
        },
      })
    },
    onSuccess: result => {
      if (!result.success) {
        toast.error(result.error)
        return
      }

      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl
        return
      }

      const message = result.reactivated ? result.message || 'Account reactivated successfully!' : 'Account activated successfully!'

      toast.success(message)
      queryClient.invalidateQueries({ queryKey: ['plans'] })

      // Refresh user entitlements immediately after reactivation
      // This ensures the user gets updated capabilities before navigation
      refreshAuthUser()
        .then(() => {
          // Redirect to dashboard after entitlements are refreshed
          window.location.href = '/dashboard'
        })
        .catch(error => {
          console.warn('Failed to refresh user entitlements after reactivation:', error)
          // Still redirect to dashboard even if refresh fails - the page reload will get fresh data
          window.location.href = '/dashboard'
        })
    },
    onError: () => toast.error('Something went wrong. Please try again.'),
    onSettled: () => setShowPlanDialog(false),
  })

  const handleStartReactivation = () => {
    if (canUserReactivate && !loadingPlans) {
      setShowPlanDialog(true)
    }
  }

  const handleConfirmReactivation = () => {
    if (selectedPlan) {
      reactivateMutation.mutate()
    }
  }

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
          <Link to='/business/subscription'>
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
            <Badge
              variant='outline'
              className={cn(
                'mx-auto mt-1 inline-flex items-center gap-1.5 text-xs',
                SubscriptionStatusVO.toBannerSeverity(reactivatableStatus) === 'error' && 'border-destructive/40 text-destructive bg-destructive/5',
              )}
            >
              Current status: {SubscriptionStatusVO.toLabel(reactivatableStatus)}
            </Badge>
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

              {/* Reactivation CTA */}
              <Card className='border-primary/30 bg-primary/5'>
                <CardHeader className='pb-3'>
                  <CardTitle className='text-base flex items-center gap-2'>
                    <CreditCardIcon className='h-4 w-4 text-primary' />
                    Choose a Plan to Reactivate
                  </CardTitle>
                  <CardDescription>Select a subscription plan and complete payment to restore your account immediately.</CardDescription>
                </CardHeader>
                <CardContent className='space-y-3'>
                  <div className='flex flex-col gap-2'>
                    <Button className='w-full gap-2' onClick={handleStartReactivation} disabled={!canUserReactivate || loadingPlans}>
                      {loadingPlans ? (
                        'Loading plans...'
                      ) : (
                        <>
                          <CreditCardIcon className='h-4 w-4' />
                          Select Plan & Reactivate
                        </>
                      )}
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

      {/* Plan Selection Dialog */}
      <PlanSelectionDialog
        open={showPlanDialog}
        onOpenChange={setShowPlanDialog}
        plans={plans}
        selectedPlan={selectedPlan}
        selectedMethod={selectedMethod}
        onPlanSelect={setSelectedPlan}
        onMethodSelect={setSelectedMethod}
        onConfirm={handleConfirmReactivation}
        isProcessing={reactivateMutation.isPending}
      />
    </div>
  )
}
