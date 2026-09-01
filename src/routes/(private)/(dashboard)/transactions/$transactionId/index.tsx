import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { AlertTriangle, Download, Receipt, RotateCcw, X } from 'lucide-react'
import { TransactionType } from 'prisma/generated/prisma/enums'
import { useMemo } from 'react'
import { toast } from 'sonner'
import Tab from '@startpos-core/components/custom/tab'
import MountManager from '@/lib/mount-manager'
import { AlertPrompt } from '@startpos-core/components/custom/prompt/alert-prompt'
import { Badge } from '@startpos-core/components/ui/badge'
import { Button } from '@startpos-core/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@startpos-core/components/ui/dialog'
import { orderCollection, orderItemCollection, paymentCollection, transactionCollection, transactionTaxLineCollection, userCollection } from '@startpos-core/db/collections'
import { useIsOnline } from '@startpos-core/hooks/use-is-online'
import { PriceEngine } from '@/lib/conversion/price-engine'
import dayjs from '@startpos-core/lib/dayjs'
import { Capabilities } from '@startpos-core/lib/entitlement/capability-keys'
import type { MountProps } from '@/lib/mount-manager'
import { createPosRefund } from '@/lib/queries/create-pos-refund'
import { downloadTransactionsCSV } from '@/lib/server-fn/download-tranasctions'
import { fetchTransactionHistory, type TransactionHistoryItem } from '@/lib/server-fn/fetch-transaction-history'
import { cn } from '@startpos-core/lib/utils'
import { downloadCsv } from '@startpos-core/lib/utils/download-csv'
import { authStore } from '@startpos-core/lib/better-auth/auth-store'
import { closeTransactionSidebar } from '../-components/transaction-sidebar'
import { ItemsTab } from './-items-tab'
import { PaymentsTab } from './-payments-tab'
import { TaxTab } from './-tax-tab'

// ─── Route ───────────────────────────────────────────────────────────────────

export const Route = createFileRoute('/(private)/(dashboard)/transactions/$transactionId/')({
  loader: ({ params }) => ({ transactionId: params.transactionId }),
  component: () => <RouteComponent />,
})

// ─── Sidebar export ───────────────────────────────────────────────────────────

interface TransactionDetailsSidebarProps extends MountProps {
  transaction: TransactionHistoryItem
}

interface RouteComponentProps {
  transaction?: TransactionHistoryItem
  onClose?: () => void
}

export function TransactionDetailsSidebar({ open: _open, transaction, onClose }: TransactionDetailsSidebarProps) {
  return <RouteComponent transaction={transaction} onClose={onClose} />
}

// ─── Refund confirmation dialog ───────────────────────────────────────────────

interface RefundDialogProps extends MountProps {
  transaction: TransactionHistoryItem
  onConfirm: () => void
  isPending: boolean
  canManageInventory: boolean
}

function RefundDialog({ open, onClose, transaction, onConfirm, isPending, canManageInventory }: RefundDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='max-w-sm'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <RotateCcw className='size-4 text-destructive' />
            Issue Refund
          </DialogTitle>
          <DialogDescription>This will reverse the full transaction. This action cannot be undone.</DialogDescription>
        </DialogHeader>

        {/* Transaction summary */}
        <div className='rounded-xl border border-border bg-muted/30 p-3 space-y-2'>
          <div className='flex items-center justify-between'>
            <span className='text-xs text-muted-foreground'>Invoice</span>
            <span className='font-mono text-xs font-bold'>{transaction.invoiceNo}</span>
          </div>
          <div className='flex items-center justify-between'>
            <span className='text-xs text-muted-foreground'>Date</span>
            <span className='text-xs'>{dayjs(transaction.createdAt).format('MMM DD, YYYY HH:mm')}</span>
          </div>
          <div className='flex items-center justify-between'>
            <span className='text-xs text-muted-foreground'>Cashier</span>
            <span className='text-xs'>{transaction.cashier?.name ?? 'System'}</span>
          </div>
          <div className='h-px bg-border' />
          <div className='flex items-center justify-between'>
            <span className='text-xs font-semibold'>Refund Amount</span>
            <span className='font-mono text-sm font-black text-destructive'>{PriceEngine.format(transaction.totalAmount)}</span>
          </div>
        </div>

        {/* Warning — inventory restock only shown if user has MANAGE_INVENTORY */}
        <div className='flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3'>
          <AlertTriangle className='size-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5' />
          <p className='text-xs text-amber-800 dark:text-amber-300 leading-relaxed'>
            {canManageInventory
              ? 'Inventory will be restocked automatically. The refund will appear as a separate transaction in the history.'
              : 'The refund will appear as a separate transaction in the history. Inventory will not be adjusted — upgrade to Premium or higher to enable automatic restock on refund.'}
          </p>
        </div>

        <DialogFooter className='gap-2 sm:gap-0'>
          <Button variant='outline' onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant='destructive' onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Processing…' : 'Confirm Refund'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

function RouteComponent({ transaction: propTransaction, onClose }: RouteComponentProps) {
  // biome-ignore lint/correctness/useHookAtTopLevel: guaranteed React context — used inside MountManager or route component
  const loaderData = propTransaction ? null : Route.useLoaderData()
  const transactionId = propTransaction ? null : (loaderData?.transactionId ?? '')
  const isOnline = useIsOnline()

  const today = dayjs().format('YYYY-MM-DD')
  const startOfYear = dayjs().startOf('year').format('YYYY-MM-DD')

  // Online: Use server function to fetch transaction
  const { data: onlineResult, isLoading: onlineLoading } = useQuery({
    queryKey: ['transaction-detail-route', transactionId],
    queryFn: () => fetchTransactionHistory({ from: startOfYear, to: today, page: 1, pageSize: 9999 }),
    enabled: !!transactionId && !propTransaction && isOnline,
  })

  // Offline: Use collections to fetch transaction
  const offlineTransaction = useMemo(() => {
    if (isOnline || !transactionId || propTransaction) return null

    const tx = transactionCollection.get(transactionId)
    if (!tx) return null

    const cashier = tx.cashierId ? userCollection.get(tx.cashierId) : null
    const payments = [...paymentCollection.values()].filter(p => p.transactionId === tx.id)
    const taxLines = [...transactionTaxLineCollection.values()].filter(t => t.transactionId === tx.id)
    const order = tx.orderId ? orderCollection.get(tx.orderId) : null
    const originalTransaction = tx.originalTransactionId ? transactionCollection.get(tx.originalTransactionId) : null
    const refunds = [...transactionCollection.values()].filter(r => r.originalTransactionId === tx.id)

    return {
      ...tx,
      cashier: cashier ? { id: cashier.id, name: cashier.name, email: cashier.email } : null,
      payments,
      taxLines,
      order: order
        ? {
            ...order,
            items: [...orderItemCollection.values()]
              .filter(i => i.orderId === order.id)
              .map(item => ({
                ...item,
                variant: null as any, // Skip deep variant/product joins offline
                selectedAddons: [],
              })),
          }
        : null,
      originalTransaction: originalTransaction ? { id: originalTransaction.id, invoiceNo: originalTransaction.invoiceNo } : null,
      refunds: refunds.map(r => ({
        id: r.id,
        invoiceNo: r.invoiceNo,
        createdAt: r.createdAt,
      })),
    } as TransactionHistoryItem
  }, [isOnline, transactionId, propTransaction])

  const transaction = propTransaction ?? (isOnline ? onlineResult?.data?.find(t => t.id === transactionId) : offlineTransaction)
  const isLoading_ = propTransaction ? false : isOnline ? onlineLoading : false

  // Auth — check ISSUE_REFUND and MANAGE_INVENTORY capabilities
  const user = useStore(authStore, state => state.user)
  const canRefund = user?.entitlement?.capabilities?.includes(Capabilities.ISSUE_REFUND) ?? false
  const canManageInventory = user?.entitlement?.capabilities?.includes(Capabilities.MANAGE_INVENTORY) ?? false

  const queryClient = useQueryClient()

  const refundMutation = useMutation({
    mutationFn: () => {
      // Build a snapshot from the transaction prop — avoids the local collection
      // lookup that fails because transactionCollection is syncMode: 'on-demand'
      // and the sidebar is fed via crudAPI (server fetch), not the local store.
      const snap = {
        id: transaction!.id,
        invoiceNo: transaction!.invoiceNo,
        totalAmount: transaction!.totalAmount,
        totalCost: transaction!.totalCost,
        taxAmount: transaction!.taxAmount,
        discount: transaction!.discount,
        // cashierId is NOT NULL on the Transaction table; fall back to
        // the current user's id if somehow missing (shouldn't happen in prod)
        cashierId: transaction!.cashier?.id ?? user!.id,
        orderId: transaction!.order?.id ?? null,
        snapshotCustomerName: transaction!.snapshotCustomerName ?? null,
        snapshotBufferRate: ((transaction! as Record<string, unknown>)['snapshotBufferRate'] as number) ?? 0,
        priceConfiguration: ((transaction! as Record<string, unknown>)['priceConfiguration'] as string) ?? 'INCLUSIVE',
        invoiceType: ((transaction! as Record<string, unknown>)['invoiceType'] as string) ?? 'SALES_INVOICE',
        complianceData: (transaction!.complianceData ?? {}) as unknown as import('@startpos-core/lib/types').TransactionComplianceData,
        payments: transaction!.payments.map(p => ({
          id: p.id,
          method: p.method,
          amount: p.amount,
          platform: p.platform ?? null,
        })),
        taxLines: transaction!.taxLines.map(l => ({
          id: l.id,
          type: l.type,
          category: l.category,
          rate: l.rate,
          taxableAmount: l.taxableAmount,
          taxAmount: l.taxAmount,
        })),
      }
      return createPosRefund(snap)
    },
    onSuccess: result => {
      if (!result.data) {
        MountManager.show(AlertPrompt, {
          title: 'Refund Failed',
          description: 'Unable to process the refund. Please try again or contact support if the issue persists.',
          btnText: 'OK'
        })
        return
      }
      toast.success(`Refund issued — ${result.data}`, { duration: 5000 })
      // Invalidate all transaction-history queries so the list refreshes
      queryClient.invalidateQueries({ queryKey: ['transaction-history'] })
      queryClient.invalidateQueries({ queryKey: ['transaction-detail-route'] })
      // Close the sidebar after a brief delay so the toast is visible
      setTimeout(() => {
        if (onClose) onClose()
        else closeTransactionSidebar()
      }, 800)
    },
    onError: () => {
      MountManager.show(AlertPrompt, {
        title: 'Refund Failed',
        description: 'An unexpected error occurred while processing the refund. Please try again.',
        btnText: 'OK'
      })
    },
  })

  const handleRefund = () => {
    if (!transaction) return
    MountManager.show(RefundDialog, {
      transaction,
      onConfirm: () => refundMutation.mutate(),
      isPending: refundMutation.isPending,
      canManageInventory,
    })
  }

  const handleClose = () => {
    if (onClose) onClose()
    else closeTransactionSidebar()
  }

  const handleExport = async () => {
    if (!transaction) return
    try {
      const date = dayjs(transaction.createdAt).format('YYYY-MM-DD')
      const response = await downloadTransactionsCSV({ data: { from: date, to: date } })
      if (!response?.data) return
      downloadCsv(response.data, `transaction-${transaction.invoiceNo}.csv`)
    } catch {
      toast.error('Failed to export transaction.')
    }
  }

  if (isLoading_)
    return (
      <div className='p-6 space-y-3 animate-pulse'>
        <div className='h-12 bg-muted rounded-xl' />
        <div className='h-48 bg-muted rounded-xl' />
      </div>
    )

  if (!transaction)
    return (
      <div className='flex flex-col items-center justify-center h-full gap-3 text-muted-foreground'>
        <Receipt className='size-8 opacity-30' />
        <p className='text-sm'>Transaction not found.</p>
      </div>
    )

  const isSale = transaction.type === TransactionType.SALE
  const isRefund = transaction.type === TransactionType.REFUND
  const alreadyRefunded = (transaction.refunds?.length ?? 0) > 0

  // Refund button is shown only on SALE transactions where the user has the
  // capability and the transaction has not already been refunded.
  const showRefundButton = isSale && canRefund

  return (
    <>
      <div className='flex flex-col h-full'>
        {/* Header */}
        <div className='flex items-start justify-between p-4 border-b shrink-0'>
          <div className='flex items-center gap-2.5'>
            <div className='h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0'>
              {isRefund ? <RotateCcw className='size-4 text-destructive' /> : <Receipt className='size-4 text-primary' />}
            </div>
            <div>
              <div className='flex items-center gap-2 flex-wrap'>
                <h2 className='text-base font-semibold leading-tight font-mono'>{transaction.invoiceNo}</h2>
                <Badge variant={isRefund ? 'destructive' : 'default'} className='text-[10px] py-0 h-4'>
                  {transaction.type}
                </Badge>
                {alreadyRefunded && (
                  <Badge variant='secondary' className='text-[10px] py-0 h-4'>
                    Refunded
                  </Badge>
                )}
              </div>
              <p className='text-xs text-muted-foreground mt-0.5'>
                {transaction.cashier?.name ?? 'System'} · {dayjs(transaction.createdAt).format('MMM DD, YYYY HH:mm')}
              </p>
            </div>
          </div>
          <Button variant='ghost' size='icon' onClick={handleClose} className='h-7 w-7 shrink-0'>
            <X className='size-4' />
          </Button>
        </div>

        {/* Stats row */}
        <div className='flex items-center gap-4 px-4 py-2.5 border-b bg-muted/20 shrink-0'>
          <div>
            <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Total</p>
            <p className={cn('text-sm font-black font-mono', isRefund ? 'text-destructive' : 'text-primary')}>{PriceEngine.format(transaction.totalAmount)}</p>
          </div>
          <div className='w-px h-6 bg-border' />
          <div>
            <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Items</p>
            <p className='text-sm font-black'>{transaction.order?.items?.length ?? 0}</p>
          </div>
          <div className='w-px h-6 bg-border' />
          <div>
            <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Tax</p>
            <p className='text-sm font-black font-mono'>{PriceEngine.format(transaction.taxAmount)}</p>
          </div>
          {transaction.originalTransaction && (
            <>
              <div className='w-px h-6 bg-border' />
              <div>
                <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Orig. Invoice</p>
                <p className='font-mono text-xs font-bold text-muted-foreground'>{transaction.originalTransaction.invoiceNo}</p>
              </div>
            </>
          )}
        </div>

        {/* Already-refunded notice */}
        {alreadyRefunded && (
          <div className='px-4 py-2 bg-muted/40 border-b shrink-0'>
            <p className='text-xs text-muted-foreground'>
              Refunded as{' '}
              {transaction.refunds!.map(r => (
                <span key={r.id} className='font-mono font-semibold text-foreground'>
                  {r.invoiceNo}
                </span>
              ))}{' '}
              · {dayjs(transaction.refunds![0]!.createdAt).format('MMM DD, YYYY')}
            </p>
          </div>
        )}

        {/* Scrollable content */}
        <div className='flex-1 overflow-y-auto p-4'>
          <Tab
            defaultValue='Items'
            tabs={[
              { label: 'Items', Component: ItemsTab, transaction },
              { label: 'Payments', Component: PaymentsTab, transaction },
              { label: 'Tax', Component: TaxTab, transaction },
            ]}
          />
        </div>

        {/* Footer */}
        <div className='p-4 border-t shrink-0 flex flex-col gap-2'>
          {showRefundButton && (
            <Button
              variant='destructive'
              className='w-full h-9 gap-2 rounded-xl'
              onClick={handleRefund}
              disabled={alreadyRefunded || refundMutation.isPending || !isOnline}
            >
              <RotateCcw className='size-3.5' />
              {alreadyRefunded ? 'Already Refunded' : isOnline ? 'Issue Refund' : 'Refund (Offline)'}
            </Button>
          )}
          <Button variant='outline' className='w-full h-9 gap-2 rounded-xl' onClick={handleExport} disabled={!isOnline}>
            <Download className='size-3.5' /> Export This Transaction
          </Button>
        </div>
      </div>
    </>
  )
}
