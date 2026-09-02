/**
 * Shared components and utilities for subscription management
 */

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
} from '@platform/components/ui/alert-dialog'
import { Badge } from '@platform/components/ui/badge'
import { Button } from '@platform/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@platform/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@platform/components/ui/dialog'
import { getAuthUser } from '@/lib/better-auth/auth-server'
import { authStore, refreshUser } from '@platform/lib/better-auth/auth-store'
import { SubscriptionStatus } from '@platform/lib/entitlement/entitlement-types'
import { cn } from '@platform/lib/utils'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  ClockIcon,
  CreditCardIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GitBranchIcon,
  MailIcon,
  PlusIcon,
  RefreshCwIcon,
  XCircleIcon,
  ZapIcon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { SubscriptionPolicy } from '@/lib/billing/policies/subscription-policy'
import { SubscriptionStatusVO } from '@/lib/billing/value-objects/subscription-status'
import MountManager, { type MountProps } from '@/lib/mount-manager'
import { cancelSubscription } from '@/lib/server-fn/cancel-subscription'
import { createBillingPortalSession } from '@/lib/server-fn/create-billing-portal-session'
import { type AddonCatalogItem, fetchAddonCatalog, purchaseAddonSubscription } from '@/lib/server-fn/purchase-addon-subscription'
import { fetchTxAddonPackages } from '@/lib/server-fn/purchase-tx-addon'

type BadgeConfig = {
  label: string
  className: string
  icon: React.ReactNode
}

export function getStatusBadgeConfig(status: SubscriptionStatus): BadgeConfig {
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

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'â€”'
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// BranchTransactionQuotaView
// Shows consolidated view of branch transaction quotas across all branches
// Only shown when business owner has MANAGE_BRANCHES permission
// ---------------------------------------------------------------------------

export function BranchTransactionQuotaView() {
  const user = useStore(authStore, state => state.user)
  const canManageBranches = user?.entitlement?.capabilities?.includes('MANAGE_BRANCHES')

  const { data: branchCredits, isLoading } = useQuery({
    queryKey: ['consolidated-branch-credits'],
    queryFn: () => getAllBranchCreditBalances(),
    enabled: canManageBranches,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  if (!canManageBranches) return null

  const isSuccess = branchCredits?.success
  const totalCredits = branchCredits?.totalCredits || 0
  const branchCount = branchCredits?.branchCount || 0
  const branches = branchCredits?.branches || []

  return (
    <Card>
      <CardHeader className='pb-2'>
        <div className='flex items-center gap-2'>
          <GitBranchIcon className='h-4 w-4 text-muted-foreground' />
          <CardTitle className='text-sm font-semibold'>Branch Transaction Quota</CardTitle>
        </div>
        <CardDescription className='text-xs'>
          Transactions across {branchCount} branch{branchCount === 1 ? '' : 'es'}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        {isLoading ? (
          <div className='space-y-2'>
            <div className='h-8 bg-muted animate-pulse rounded' />
            <div className='h-4 bg-muted animate-pulse rounded w-3/4' />
          </div>
        ) : !isSuccess ? (
          <p className='text-xs text-muted-foreground'>Unable to load branch quota information</p>
        ) : (
          <>
            <div className='flex items-end gap-1.5'>
              <p className={cn('text-2xl font-bold tabular-nums', totalCredits === 0 ? 'text-muted-foreground' : 'text-foreground')}>
                {totalCredits.toLocaleString()}
              </p>
              <p className='text-xs text-muted-foreground pb-1'>total</p>
            </div>

            {totalCredits === 0 ? (
              <p className='text-xs text-muted-foreground'>No prepaid transactions purchased yet</p>
            ) : (
              <p className='text-xs text-muted-foreground'>Combined quota available for overflow transactions</p>
            )}

            <div className='flex flex-col gap-1.5'>
              <Button size='sm' variant='outline' className='w-full' asChild>
                <Link to='/billing'>
                  <ZapIcon className='h-3 w-3 mr-1.5' />
                  Manage branch quota
                </Link>
              </Button>

              {branches.length > 0 && (
                <div className='text-xs text-muted-foreground space-y-1'>
                  <p className='font-medium'>By branch:</p>
                  {branches.slice(0, 3).map(branch => (
                    <div key={branch.branchId} className='flex justify-between'>
                      <span className='truncate'>{branch.branchName}</span>
                      <span className='font-mono'>{branch.balance}</span>
                    </div>
                  ))}
                  {branches.length > 3 && <p className='text-center'>+{branches.length - 3} more</p>}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// Placeholder function - should be imported from appropriate location
async function getAllBranchCreditBalances() {
  // TODO: Implement this function or import from the correct location
  return { success: false, totalCredits: 0, branchCount: 0, branches: [] }
}

// ---------------------------------------------------------------------------
// AddonDialog
// Unified dialog for purchasing any monthly addon subscription via Stripe.
// ---------------------------------------------------------------------------

export function AddonDialog({ addon, open, onClose }: MountProps & { addon: AddonCatalogItem | null }) {
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
                  âˆ’
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
                      <p className='text-xs text-muted-foreground mt-0.5'>+{pkg.txAmount.toLocaleString()} transactions/mo â€” auto-renews</p>
                    </div>
                    <span className='font-bold text-base tabular-nums text-primary'>{pkg.displayPrice}/mo</span>
                  </button>
                )))}

          {/* Capability addon â€” just a confirm */}
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
              Total: {addon.displayPrice.replace('â‚±', '')} Ã— {quantity} = â‚±
              {(parseInt(addon.displayPrice.replace('â‚±', '').replace(',', ''), 10) * quantity).toLocaleString()}/mo
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={handleClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canProceed || mutation.isPending} className='gap-1.5'>
            {mutation.isPending ? (
              'Redirectingâ€¦'
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
// BillingCTAs
// Renders the appropriate action buttons for the current subscription status.
// ---------------------------------------------------------------------------

export function BillingCTAs({ status, isBlocked, cancelledAt }: { status: SubscriptionStatus; isBlocked: boolean; cancelledAt: string | null | undefined }) {
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
      {/* Upgrade â€” shown during trial */}
      {status === SubscriptionStatus.TRIAL && (
        <Button size='sm' variant='default' asChild>
          <Link to={'/business/subscription/plans'}>
            <CreditCardIcon className='h-4 w-4 mr-1.5' />
            Upgrade Plan
          </Link>
        </Button>
      )}

      {/* Invoices link â€” shown when active */}
      {status === SubscriptionStatus.ACTIVE && (
        <Button size='sm' variant='outline' asChild>
          <Link to={'/billing/invoices'}>
            <FileTextIcon className='h-4 w-4 mr-1.5' />
            View Invoices
          </Link>
        </Button>
      )}

      {/* Cancel subscription â€” only when ACTIVE and not already scheduled for cancellation */}
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
                {cancelMutation.isPending ? 'Cancellingâ€¦' : 'Yes, cancel'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {isBlocked && status !== SubscriptionStatus.LONG_TERM_INACTIVE && (
        <Button size='sm' variant='default' asChild>
          <Link to={'/business/subscription/plans'}>
            <RefreshCwIcon className='h-4 w-4 mr-1.5' />
            Reactivate Subscription
          </Link>
        </Button>
      )}

      {canReactivate && (
        <Button size='sm' variant='default' asChild>
          <Link to='/subscription/reactivate'>
            <RefreshCwIcon className='h-4 w-4 mr-1.5' />
            {status === SubscriptionStatus.LONG_TERM_INACTIVE ? 'Reactivate Account' : 'Reactivate Subscription'}
          </Link>
        </Button>
      )}

      {status === SubscriptionStatus.SUSPENDED && (
        <Button size='sm' variant='outline' asChild>
          <a href='mailto:support@startpos.app'>
            <MailIcon className='h-4 w-4 mr-1.5' />
            Contact Support
          </a>
        </Button>
      )}

      {status === SubscriptionStatus.GRACE_PERIOD && <GracePeriodPortalButton />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// GracePeriodPortalButton
// Opens the Stripe Billing Portal so the user can update their payment method.
// ---------------------------------------------------------------------------
export function GracePeriodPortalButton() {
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
      {portalMutation.isPending ? 'Openingâ€¦' : 'Update Payment Method'}
    </Button>
  )
}
