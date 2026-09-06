import { getColumns } from '@platform/components/custom/data-view'
import { TableView } from '@platform/components/custom/data-view/table-view'
import { type DateRange, DateRangeInput } from '@platform/components/custom/form/date-rage-input'
import { OfflineIndicator } from '@platform/components/custom/offline-indicator'
import { Button } from '@platform/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@platform/components/ui/select'
import {
  orderCollection,
  orderItemCollection,
  paymentCollection,
  transactionCollection,
  transactionTaxLineCollection,
  userCollection,
} from '@platform/db/collections'
import { useIsOnline } from '@platform/hooks/use-is-online'
import dayjs from '@platform/lib/dayjs'
import { Capabilities } from '@platform/lib/entitlement/capability-keys'
import MountManager from '@platform/lib/mount-manager'
import { downloadCsv } from '@platform/lib/utils/download-csv'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate, useSearch } from '@tanstack/react-router'
import { Download, Receipt } from 'lucide-react'
import type { PaymentMethod, TransactionType } from 'prisma/generated/prisma/enums'
import { useCallback, useMemo, useState } from 'react'
import { getAuthenticatedUser } from '@/lib/better-auth/auth-store'
import { transactionCols } from '@/lib/columns/transaction-columns'
import { downloadTransactionsCSV } from '@/lib/server-fn/download-tranasctions'
import { fetchTransactionHistory, type TransactionHistoryItem } from '@/lib/server-fn/fetch-transaction-history'
import { closeTransactionSidebar, showTransactionSidebar, TRANSACTION_ASIDE_ID } from './-components/transaction-sidebar'
import { TransactionDetailsSidebar } from './$transactionId'

const TYPE_LABELS: Record<TransactionType, string> = {
  SALE: 'Sale',
  REFUND: 'Refund',
  ADJUSTMENT: 'Adjustment',
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  E_WALLET: 'E-Wallet',
  CARD: 'Card',
  CREDIT: 'Credit',
}

export const Route = createFileRoute('/(private)/(dashboard)/transactions/')({
  beforeLoad: () => {
    const user = getAuthenticatedUser()
    if (!user.entitlement.capabilities.includes(Capabilities.VIEW_TRANSACTION_HISTORY)) {
      throw redirect({ to: '/unauthorized' })
    }
  },
  validateSearch: (search: Record<string, unknown>) => ({
    from: (search['from'] as string) || dayjs().startOf('month').format('YYYY-MM-DD'),
    to: (search['to'] as string) || dayjs().endOf('month').format('YYYY-MM-DD'),
    cashierId: (search['cashierId'] as string) ?? undefined,
    method: (search['method'] as PaymentMethod) ?? undefined,
    type: (search['type'] as TransactionType) ?? undefined,
    search: (search['search'] as string) ?? undefined,
    page: Number(search['page']) || 1,
    pageSize: Number(search['pageSize']) || 50,
  }),
  component: RouteComponent,
})

function RouteComponent() {
  const searchParams = useSearch({ from: '/(private)/(dashboard)/transactions/' })
  const navigate = useNavigate({ from: Route.fullPath })
  const [selectedId, setSelectedId] = useState<string>('')
  const isOnline = useIsOnline()

  const { from, to, method, type, page, pageSize } = searchParams

  // Online: Use server function for optimal performance
  const { data: onlineResult, isLoading: onlineLoading } = useQuery({
    queryKey: ['transaction-history', searchParams],
    queryFn: () => fetchTransactionHistory(searchParams),
    enabled: isOnline,
  })

  // Offline: Use collections with basic filtering
  const offlineData = useMemo(() => {
    if (isOnline) return null

    const fromDate = dayjs(from).startOf('day').toDate()
    const toDate = dayjs(to).endOf('day').toDate()

    // Get all transactions and filter by date range
    let filtered = [...transactionCollection.values()].filter(tx => {
      const txDate = new Date(tx.createdAt)
      return txDate >= fromDate && txDate <= toDate
    })

    // Filter by type if specified
    if (type) {
      filtered = filtered.filter(tx => tx.type === type)
    }

    // Sort by date (newest first)
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // Limit to 200 most recent transactions for offline viewing
    const limited = filtered.slice(0, 200)

    // Paginate
    const paginated = limited.slice((page - 1) * pageSize, page * pageSize)

    // Enrich with related data
    const enriched: TransactionHistoryItem[] = paginated.map(tx => {
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
                  // biome-ignore lint/suspicious/noExplicitAny: flexibility required
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
    })

    return {
      data: enriched,
      totalItems: Math.min(limited.length, 200), // Cap at 200 for pagination
      page,
      pageSize,
      isOfflineMode: true,
    }
  }, [isOnline, from, to, type, page, pageSize])

  const result = isOnline ? onlineResult : offlineData
  const transactions = result?.data ?? []
  const totalItems = result?.totalItems ?? 0
  const isLoading = isOnline ? onlineLoading : false

  // Debug logging
  console.log('[TransactionsPage] Render state:', {
    isOnline,
    isLoading,
    transactionCount: transactions.length,
    totalItems,
    searchParams,
  })

  const handleSelectRow = useCallback((tx: TransactionHistoryItem) => {
    setSelectedId(tx.id)
    showTransactionSidebar(
      <TransactionDetailsSidebar
        open
        transaction={tx}
        onClose={() => {
          setSelectedId('')
          closeTransactionSidebar()
        }}
      />,
    )
  }, [])

  const handleDateChange = (range: DateRange) => {
    if (!range) return
    navigate({
      search: prev => ({
        ...prev,
        from: range.from ? dayjs(range.from).format('YYYY-MM-DD') : dayjs().startOf('month').format('YYYY-MM-DD'),
        to: range.to ? dayjs(range.to).format('YYYY-MM-DD') : dayjs().endOf('month').format('YYYY-MM-DD'),
        page: 1,
      }),
    })
  }

  const handleDownload = async () => {
    try {
      const response = await downloadTransactionsCSV({ data: { from, to, method, type } })
      if (!response?.data) return
      downloadCsv(response.data, `transactions-${from}-${to}.csv`)
    } catch (err) {
      console.error('Failed to download CSV:', err)
    }
  }

  const columns = useMemo(
    () =>
      getColumns<TransactionHistoryItem>(h => [
        transactionCols.paginatedNumber(h, { page, pageSize }),
        transactionCols.invoiceNo(h),
        transactionCols.type(h),
        transactionCols.cashier(h),
        transactionCols.orderNumber(h),
        transactionCols.paymentMethod(h),
        transactionCols.totalAmount(h),
        transactionCols.date(h),
      ]),
    [page, pageSize],
  )

  return (
    <div className='w-full h-screen bg-background flex overflow-hidden relative min-h-0 flex-1'>
      <div className='flex-1 min-w-0 h-full px-4 flex flex-col overflow-hidden transition-all duration-300 ease-in-out bg-background/50 space-y-2'>
        {/* Offline Indicator */}
        <OfflineIndicator message='Viewing cached transactions (up to 200 most recent). Payment method and search filters unavailable offline.' />

        {/* Header */}
        <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
          <div>
            <h1 className='text-3xl font-bold tracking-tight text-foreground flex items-center gap-2'>
              <Receipt className='h-7 w-7 text-primary' />
              Transactions
            </h1>
            <p className='text-muted-foreground text-sm'>Full history of all sales, refunds, and adjustments.</p>
          </div>
          <Button size='sm' variant='outline' onClick={handleDownload} disabled={!isOnline}>
            <Download className='size-4' /> Export CSV
          </Button>
        </div>

        {/* Filters */}
        <div className='flex flex-wrap items-center gap-2'>
          <DateRangeInput
            value={{ from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined }}
            onChange={handleDateChange}
            placeholder='Date range'
          />
          <Select
            value={type ?? 'all'}
            onValueChange={val => navigate({ search: prev => ({ ...prev, type: val === 'all' ? undefined : (val as TransactionType), page: 1 }) })}
          >
            <SelectTrigger className='h-8 w-36 text-xs'>
              <SelectValue placeholder='All types' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All types</SelectItem>
              {Object.entries(TYPE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={method ?? 'all'}
            onValueChange={val => navigate({ search: prev => ({ ...prev, method: val === 'all' ? undefined : (val as PaymentMethod), page: 1 }) })}
            disabled={!isOnline}
          >
            <SelectTrigger className='h-8 w-36 text-xs'>
              <SelectValue placeholder='All methods' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All methods</SelectItem>
              {Object.entries(METHOD_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <TableView
          data={transactions}
          isFetching={isLoading}
          columns={columns}
          emptyMessage='No transactions found for the selected filters.'
          selectableRow={{
            onClick: handleSelectRow,
            isSelected: row => row.id === selectedId,
          }}
          paginable={{
            pageIndex: page - 1,
            pageSize,
            totalItems,
            onPaginationChange: next => {
              navigate({
                search: prev => ({ ...prev, page: next.pageIndex + 1, pageSize: next.pageSize }),
                replace: true,
              })
            },
          }}
        />
      </div>

      <MountManager id={TRANSACTION_ASIDE_ID} />
    </div>
  )
}
