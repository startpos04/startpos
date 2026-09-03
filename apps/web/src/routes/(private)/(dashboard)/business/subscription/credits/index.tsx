/**
 * billing/credits/index.tsx
 *
 * /billing/credits â€” Prepaid Credit Management
 *
 * Displays:
 *   - Current credit balance (large, prominent)
 *   - Low-balance / depleted warning
 *   - Buy Credits dialog â€” three fixed packages, redirects to Stripe Checkout
 *   - Paginated CreditLedger history via TableView with columns:
 *     Event, Amount, Balance After, Transaction ID, Cashier, Date
 */

import { getColumns } from '@platform/components/custom/data-view'
import { TableView } from '@platform/components/custom/data-view/table-view'
import { Badge } from '@platform/components/ui/badge'
import { Button } from '@platform/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@platform/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@platform/components/ui/dialog'
import { authStore } from '@platform/lib/better-auth/auth-store'
import dayjs from '@platform/lib/dayjs'
import { cn } from '@platform/lib/utils'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { AlertTriangleIcon, CheckCircle2Icon, CircleDollarSignIcon, CoinsIcon, ExternalLinkIcon, ShoppingCartIcon, XCircleIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { creditCols } from '@/lib/columns/credit-columns'
import type { MountProps } from '@platform/lib/mount-manager'
import MountManager from '@platform/lib/mount-manager'
import { type CreditLedgerEntry, fetchCreditLedger } from '@/lib/server-fn/fetch-credit-ledger'
import { type CreditPackageOption, fetchCreditPackages, purchaseCreditPackage } from '@/lib/server-fn/purchase-credit-package'
import { GCashPaymentGuide } from '../-components/gcash-payment-guide'

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/(private)/(dashboard)/business/subscription/credits/')({
  validateSearch: (search: Record<string, unknown>) => ({
    page: Number(search['page']) || 1,
    pageSize: Number(search['pageSize']) || 30,
    purchase: (search['purchase'] as 'success' | 'cancelled') ?? undefined,
  }),
  component: CreditsPage,
})

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOW_BALANCE_DEFAULT_THRESHOLD = 10

// ---------------------------------------------------------------------------
// BuyCreditsDialog
// ---------------------------------------------------------------------------

interface BuyCreditsDialogProps extends MountProps {}

function BuyCreditsDialog({ open, onClose }: BuyCreditsDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: packages = [], isLoading: isLoadingPackages } = useQuery({
    queryKey: ['credit-packages'],
    queryFn: () => fetchCreditPackages(),
    enabled: open,
    staleTime: 60_000,
  })

  const mutation = useMutation({
    mutationFn: async (packageId: string) => {
      const result = await purchaseCreditPackage({
        data: { packageId: packageId as CreditPackageOption['id'] },
      })
      if (!result.success) throw new Error(result.error)
      return result
    },
    onSuccess: result => {
      // Redirect to Stripe Checkout
      window.location.href = result.checkoutUrl
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const handleProceed = () => {
    if (!selectedId) return
    mutation.mutate(selectedId)
  }

  const handleClose = () => {
    if (mutation.isPending) return
    setSelectedId(null)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={open => !open && handleClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Buy Credits</DialogTitle>
          <DialogDescription>Select a package. You'll be redirected to Stripe to complete payment securely.</DialogDescription>
        </DialogHeader>

        {/* GCash payment guide â€” shown here so users know how to pay before selecting a package */}
        <GCashPaymentGuide />

        <div className='space-y-2 py-2'>
          {isLoadingPackages ? (
            <div className='space-y-2'>
              {[1, 2, 3].map(i => (
                <div key={i} className='h-16 rounded-lg bg-muted animate-pulse' />
              ))}
            </div>
          ) : (
            packages.map(pkg => (
              <button
                key={pkg.id}
                type='button'
                onClick={() => setSelectedId(pkg.id)}
                className={cn(
                  'w-full flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-all',
                  'hover:border-primary/60 hover:bg-primary/5',
                  selectedId === pkg.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card',
                )}
              >
                <div>
                  <p className='font-semibold text-sm'>{pkg.label}</p>
                  <p className='text-xs text-muted-foreground mt-0.5'>
                    {pkg.creditAmount} credit{pkg.creditAmount === 1 ? '' : 's'} added to your balance
                  </p>
                </div>
                <span className='font-bold text-base tabular-nums text-primary'>{pkg.displayPrice}</span>
              </button>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={handleClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleProceed} disabled={!selectedId || mutation.isPending} className='gap-1.5'>
            {mutation.isPending ? (
              'Redirectingâ€¦'
            ) : (
              <>
                <ExternalLinkIcon className='h-3.5 w-3.5' />
                Proceed to payment
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function CreditsPage() {
  const user = useStore(authStore, s => s.user)
  const entitlement = user?.entitlement
  const navigate = useNavigate({ from: Route.fullPath })
  const { page, pageSize, purchase } = useSearch({ from: '/(private)/(dashboard)/billing/credits/' })

  const isPrepaid = entitlement?.creditBalance !== null && entitlement?.creditBalance !== undefined

  const { data, isLoading } = useQuery({
    queryKey: ['credit-ledger', page, pageSize],
    queryFn: () => fetchCreditLedger({ data: { page, pageSize } }),
    enabled: isPrepaid,
  })

  const currentBalance = data?.currentBalance ?? entitlement?.creditBalance ?? 0
  const entries = data?.entries ?? []
  const totalItems = data?.totalItems ?? 0

  const rawThreshold = (user?.configs as Record<string, unknown> | undefined)?.['CREDIT_LOW_BALANCE_THRESHOLD']
  const threshold = typeof rawThreshold === 'number' ? rawThreshold : typeof rawThreshold === 'string' ? Number(rawThreshold) : LOW_BALANCE_DEFAULT_THRESHOLD

  const isLow = currentBalance <= threshold
  const isEmpty = currentBalance === 0

  // Clear the ?purchase param from the URL without pushing a new history entry
  const clearPurchaseParam = () => {
    void navigate({ search: prev => ({ ...prev, purchase: undefined }), replace: true })
  }

  const columns = useMemo(
    () =>
      getColumns<CreditLedgerEntry>(h => [
        creditCols.eventType(h),
        creditCols.amount(h),
        creditCols.balanceAfter(h),
        creditCols.transactionId(h),
        creditCols.actorName(h),
        creditCols.date(h),
      ]),
    [],
  )

  // If not a prepaid plan, show a plain placeholder
  if (!isPrepaid) {
    return (
      <div className='flex flex-col gap-6 px-4 pb-6 max-w-4xl'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Credits</h1>
          <p className='text-muted-foreground text-sm mt-1'>Prepaid credit balance and history.</p>
        </div>
        <Card className='border-dashed'>
          <CardContent className='py-12 text-center'>
            <CoinsIcon className='h-10 w-10 mx-auto text-muted-foreground/40 mb-3' />
            <p className='text-sm font-medium text-muted-foreground'>Credits are not enabled for your current subscription plan.</p>
            <p className='text-xs text-muted-foreground mt-1'>Switch to a Prepaid Credits plan to use this feature.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-6 px-4 pb-6 max-w-4xl h-full'>
      {/* Purchase result banners â€” shown after Stripe redirects back */}
      {purchase === 'success' && (
        <div
          className={cn(
            'flex items-start gap-3 rounded-lg border px-4 py-3 text-sm',
            'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
          )}
        >
          <CheckCircle2Icon className='h-4 w-4 mt-0.5 shrink-0' />
          <div className='flex-1'>
            <p className='font-medium'>Payment received</p>
            <p className='text-xs mt-0.5 opacity-80'>Your credits will appear in the balance shortly once the payment is confirmed.</p>
          </div>
          <button type='button' onClick={clearPurchaseParam} className='opacity-60 hover:opacity-100 transition-opacity'>
            <XCircleIcon className='h-4 w-4' />
          </button>
        </div>
      )}
      {purchase === 'cancelled' && (
        <div
          className={cn(
            'flex items-start gap-3 rounded-lg border px-4 py-3 text-sm',
            'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
          )}
        >
          <XCircleIcon className='h-4 w-4 mt-0.5 shrink-0' />
          <div className='flex-1'>
            <p className='font-medium'>Payment cancelled</p>
            <p className='text-xs mt-0.5 opacity-80'>No charge was made. You can try again whenever you're ready.</p>
          </div>
          <button type='button' onClick={clearPurchaseParam} className='opacity-60 hover:opacity-100 transition-opacity'>
            <XCircleIcon className='h-4 w-4' />
          </button>
        </div>
      )}

      {/* Header */}
      <div className='flex items-start justify-between gap-4'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Credits</h1>
          <p className='text-muted-foreground text-sm mt-1'>Prepaid credit balance and transaction history.</p>
        </div>
        <Button size='sm' className='gap-1.5 shrink-0' onClick={() => MountManager.show(BuyCreditsDialog, {})}>
          <ShoppingCartIcon className='h-4 w-4' />
          Buy Credits
        </Button>
      </div>

      {/* Balance card */}
      <Card className={cn('border', isEmpty && 'border-destructive/50', isLow && !isEmpty && 'border-amber-300/60')}>
        <CardHeader className='pb-3'>
          <div className='flex items-center justify-between'>
            <CardTitle className='text-lg flex items-center gap-2'>
              <CircleDollarSignIcon className='h-5 w-5 text-muted-foreground' />
              Current Balance
            </CardTitle>
            {isEmpty && (
              <Badge variant='outline' className='bg-red-100 text-red-700 border-red-200 text-xs'>
                Depleted
              </Badge>
            )}
            {isLow && !isEmpty && (
              <Badge variant='outline' className='bg-amber-100 text-amber-700 border-amber-200 text-xs flex items-center gap-1'>
                <AlertTriangleIcon className='h-3 w-3' />
                Low Balance
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className='space-y-3'>
          <div className='flex items-end gap-2'>
            <span
              className={cn(
                'text-5xl font-bold tabular-nums tracking-tight',
                isEmpty ? 'text-destructive' : isLow ? 'text-amber-600 dark:text-amber-400' : 'text-foreground',
              )}
            >
              {currentBalance.toLocaleString()}
            </span>
            <span className='text-lg text-muted-foreground mb-1'>credit{currentBalance === 1 ? '' : 's'}</span>
          </div>
          {isEmpty && <p className='text-sm text-destructive'>Balance depleted â€” buy credits to continue processing transactions.</p>}
          {isLow && !isEmpty && (
            <p className='text-sm text-amber-600 dark:text-amber-400'>
              Balance is below the low-balance threshold of {threshold} credits. Top up soon to avoid checkout interruptions.
            </p>
          )}
          {!isLow && !isEmpty && <p className='text-sm text-muted-foreground'>1 credit is consumed per transaction.</p>}
        </CardContent>
      </Card>

      {/* Ledger history */}
      <Card className='flex flex-col flex-1 min-h-0'>
        <CardHeader className='pb-3 shrink-0'>
          <div className='flex items-center justify-between'>
            <div>
              <CardTitle className='text-lg'>Credit History</CardTitle>
              <CardDescription className='text-xs mt-0.5'>All credit events â€” grants, checkouts, refunds, and adjustments.</CardDescription>
            </div>
            <span className='text-xs text-muted-foreground'>
              {totalItems.toLocaleString()} event{totalItems === 1 ? '' : 's'}
            </span>
          </div>
        </CardHeader>
        <CardContent className='flex flex-col flex-1 min-h-0 pb-4'>
          {entries.length === 0 && !isLoading ? (
            <div className='py-10 text-center'>
              <CoinsIcon className='h-8 w-8 mx-auto text-muted-foreground/30 mb-2' />
              <p className='text-sm text-muted-foreground'>No credit events yet.</p>
            </div>
          ) : (
            <TableView
              data={entries}
              isFetching={isLoading}
              columns={columns}
              emptyMessage='No credit events found.'
              paginable={{
                pageIndex: page - 1,
                pageSize,
                totalItems,
                onPaginationChange: next => {
                  void navigate({
                    search: prev => ({ ...prev, page: next.pageIndex + 1, pageSize: next.pageSize }),
                    replace: true,
                  })
                },
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
