import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Download, Receipt, RotateCcw, X } from 'lucide-react'
import { type PaymentMethod, TransactionType } from 'prisma/generated/prisma/enums'
import { toast } from 'sonner'
import Tab from '@/components/custom/tab'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PriceEngine } from '@/lib/conversion/price-engine'
import dayjs from '@/lib/dayjs'
import type { MountProps } from '@/lib/mount-manager'
import { downloadTransactionsCSV } from '@/lib/server-fn/download-tranasctions'
import { fetchTransactionHistory, type TransactionHistoryItem } from '@/lib/server-fn/fetch-transaction-history'
import { cn } from '@/lib/utils'
import { downloadCsv } from '@/lib/utils/download-csv'
import { closeTransactionSidebar } from '../-components/transaction-sidebar'

// ─── Route ───────────────────────────────────────────────────────────────────

export const Route = createFileRoute('/(private)/(dashboard)/(supervisor)/transactions/$transactionId/')({
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

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function ItemsTab({ transaction }: { transaction: TransactionHistoryItem }) {
  const items = transaction.order?.items ?? []
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className='text-xs font-bold'>Product</TableHead>
          <TableHead className='text-xs font-bold text-right'>Qty</TableHead>
          <TableHead className='text-xs font-bold text-right'>Unit Price</TableHead>
          <TableHead className='text-xs font-bold text-right'>Subtotal</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length > 0 ? (
          items.map(item => (
            <TableRow key={item.id}>
              <TableCell className='py-2'>
                <p className='text-xs font-medium leading-tight'>{item.variant?.product?.name ?? '—'}</p>
                {item.variant?.name && <p className='text-[10px] text-muted-foreground font-mono mt-0.5'>{item.variant.name}</p>}
                {item.variant?.sku && <p className='text-[10px] text-muted-foreground font-mono'>SKU: {item.variant.sku}</p>}
                {item.selectedAddons?.map(addon => (
                  <p key={addon.id} className='text-[10px] text-muted-foreground ml-2 mt-0.5'>
                    + {addon.addon?.product?.name} ({addon.quantity}×)
                  </p>
                ))}
              </TableCell>
              <TableCell className='text-right font-mono text-xs py-2'>{item.quantity}</TableCell>
              <TableCell className='text-right font-mono text-xs py-2'>{PriceEngine.format(item.unitPrice)}</TableCell>
              <TableCell className='text-right font-mono text-xs font-bold py-2'>{PriceEngine.format(Math.round(item.quantity * item.unitPrice))}</TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={4} className='text-center py-8 text-xs text-muted-foreground'>
              No line items recorded.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}

function PaymentsTab({ transaction }: { transaction: TransactionHistoryItem }) {
  const METHOD_LABELS: Record<PaymentMethod, string> = {
    CASH: 'Cash',
    E_WALLET: 'E-Wallet',
    CARD: 'Card',
    CREDIT: 'Credit',
  }

  return (
    <div className='space-y-3'>
      {transaction.payments.map(payment => (
        <div key={payment.id} className='rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2'>
          <div className='flex items-center justify-between'>
            <Badge variant='outline' className='text-[10px]'>
              {METHOD_LABELS[payment.method as PaymentMethod] ?? payment.method}
            </Badge>
            {payment.platform && <span className='text-[10px] text-muted-foreground'>{payment.platform}</span>}
          </div>
          <div className='grid grid-cols-2 gap-x-4 gap-y-2'>
            <div>
              <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Amount</p>
              <p className='font-mono text-sm font-black text-primary'>{PriceEngine.format(payment.amount)}</p>
            </div>
            {payment.tendered !== payment.amount && (
              <>
                <div>
                  <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Tendered</p>
                  <p className='font-mono text-sm font-bold'>{PriceEngine.format(payment.tendered)}</p>
                </div>
                <div>
                  <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Change</p>
                  <p className='font-mono text-sm font-bold'>{PriceEngine.format(payment.change)}</p>
                </div>
              </>
            )}
            {payment.referenceNo && (
              <div className='col-span-2'>
                <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Reference</p>
                <p className='font-mono text-xs'>{payment.referenceNo}</p>
              </div>
            )}
          </div>
        </div>
      ))}
      {transaction.payments.length === 0 && <p className='text-center py-8 text-xs text-muted-foreground'>No payment records.</p>}
    </div>
  )
}

function TaxTab({ transaction }: { transaction: TransactionHistoryItem }) {
  return (
    <div className='space-y-3'>
      {/* Summary card */}
      <div className='rounded-xl border border-border/50 bg-muted/20 p-3 grid grid-cols-2 gap-x-4 gap-y-2.5'>
        <div>
          <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Total Amount</p>
          <p className='font-mono text-sm font-black text-primary'>{PriceEngine.format(transaction.totalAmount)}</p>
        </div>
        <div>
          <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Tax Amount</p>
          <p className='font-mono text-sm font-bold'>{PriceEngine.format(transaction.taxAmount)}</p>
        </div>
        <div>
          <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Discount</p>
          <p className='font-mono text-sm font-bold'>{PriceEngine.format(transaction.discount)}</p>
        </div>
        <div>
          <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Total Cost</p>
          <p className='font-mono text-sm font-bold'>{PriceEngine.format(transaction.totalCost)}</p>
        </div>
      </div>

      {/* Tax lines */}
      {transaction.taxLines.length > 0 && (
        <div className='rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2'>
          <p className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>Tax Breakdown</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='text-xs font-bold'>Type</TableHead>
                <TableHead className='text-xs font-bold'>Category</TableHead>
                <TableHead className='text-xs font-bold text-right'>Rate</TableHead>
                <TableHead className='text-xs font-bold text-right'>Taxable</TableHead>
                <TableHead className='text-xs font-bold text-right'>Tax</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transaction.taxLines.map(line => (
                <TableRow key={line.id}>
                  <TableCell className='text-xs py-1.5'>{line.type}</TableCell>
                  <TableCell className='text-xs py-1.5'>{line.category}</TableCell>
                  <TableCell className='text-right font-mono text-xs py-1.5'>{line.rate}%</TableCell>
                  <TableCell className='text-right font-mono text-xs py-1.5'>{PriceEngine.format(line.taxableAmount)}</TableCell>
                  <TableCell className='text-right font-mono text-xs font-bold py-1.5'>{PriceEngine.format(line.taxAmount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* SC/PWD compliance data */}
      {transaction.complianceData && Object.keys(transaction.complianceData as object).length > 0 && (
        <div className='rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2'>
          <p className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>Compliance Data</p>
          <div className='grid grid-cols-2 gap-x-4 gap-y-2'>
            {Object.entries(transaction.complianceData as Record<string, unknown>).map(([key, value]) =>
              value ? (
                <div key={key}>
                  <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                  <p className='text-xs font-medium'>{String(value)}</p>
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

function RouteComponent({ transaction: propTransaction, onClose }: RouteComponentProps) {
  // biome-ignore lint/correctness/useHookAtTopLevel: guaranteed React context — used inside MountManager or route component
  const loaderData = propTransaction ? null : Route.useLoaderData()
  const transactionId = propTransaction ? null : (loaderData?.transactionId ?? '')

  const today = dayjs().format('YYYY-MM-DD')
  const startOfYear = dayjs().startOf('year').format('YYYY-MM-DD')

  // Only fetch when rendered as a standalone route (no prop passed from list page)
  const { data: result, isLoading } = useQuery({
    queryKey: ['transaction-detail-route', transactionId],
    queryFn: () => fetchTransactionHistory({ from: startOfYear, to: today, page: 1, pageSize: 9999 }),
    enabled: !!transactionId && !propTransaction,
  })

  const transaction = propTransaction ?? result?.data?.find(t => t.id === transactionId)
  const isLoading_ = propTransaction ? false : isLoading

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

  const isRefund = transaction.type === TransactionType.REFUND

  return (
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
      <div className='p-4 border-t shrink-0'>
        <Button variant='outline' className='w-full h-9 gap-2 rounded-xl' onClick={handleExport}>
          <Download className='size-3.5' /> Export This Transaction
        </Button>
      </div>
    </div>
  )
}
