import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate, useSearch } from '@tanstack/react-router'
import { Download, Receipt } from 'lucide-react'
import type { PaymentMethod, TransactionType } from 'prisma/generated/prisma/enums'
import { useCallback, useMemo, useState } from 'react'
import { getColumns } from '@/components/custom/data-view'
import { TableView } from '@/components/custom/data-view/table-view'
import { type DateRange, DateRangeInput } from '@/components/custom/form/date-rage-input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PriceEngine } from '@/lib/conversion/price-engine'
import dayjs from '@/lib/dayjs'
import MountManager from '@/lib/mount-manager'
import { downloadTransactionsCSV } from '@/lib/server-fn/download-tranasctions'
import { fetchTransactionHistory, type TransactionHistoryItem } from '@/lib/server-fn/fetch-transaction-history'
import { downloadCsv } from '@/lib/utils/download-csv'
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

const TYPE_VARIANTS: Record<TransactionType, 'default' | 'destructive' | 'secondary'> = {
  SALE: 'default',
  REFUND: 'destructive',
  ADJUSTMENT: 'secondary',
}

import { Capabilities } from '@/lib/entitlement/capability-keys'
import { authStore } from '@/store/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/(supervisor)/transactions/')({
  beforeLoad: () => {
    const { user } = authStore.state
    if (!user?.entitlement?.capabilities?.includes(Capabilities.VIEW_TRANSACTION_HISTORY)) {
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
  const searchParams = useSearch({ from: '/(private)/(dashboard)/(supervisor)/transactions/' })
  const navigate = useNavigate({ from: Route.fullPath })
  const [selectedId, setSelectedId] = useState<string>('')

  const { from, to, method, type, page, pageSize } = searchParams

  const { data: result, isLoading } = useQuery({
    queryKey: ['transaction-history', searchParams],
    queryFn: () => fetchTransactionHistory(searchParams),
  })

  const transactions = result?.data ?? []
  const totalItems = result?.totalItems ?? 0

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
        h.display({
          id: 'number',
          maxSize: 50,
          header: 'No.',
          cell: info => (
            <span className='text-xs font-mono text-muted-foreground/50'>{((page - 1) * pageSize + info.row.index + 1).toString().padStart(2, '0')}</span>
          ),
        }),
        h.accessor('invoiceNo', {
          header: 'Invoice No.',
          cell: info => <span className='font-mono text-xs font-bold text-primary'>{info.getValue()}</span>,
        }),
        h.accessor('type', {
          header: 'Type',
          maxSize: 100,
          cell: info => (
            <Badge variant={TYPE_VARIANTS[info.getValue()]} className='text-[10px]'>
              {TYPE_LABELS[info.getValue()]}
            </Badge>
          ),
        }),
        h.display({
          id: 'cashier',
          header: 'Cashier',
          cell: ({ row }) => <span className='text-sm'>{row.original.cashier?.name ?? '—'}</span>,
        }),
        h.display({
          id: 'order',
          header: 'Order No.',
          cell: ({ row }) => <span className='font-mono text-xs text-muted-foreground'>{row.original.order?.orderNumber ?? '—'}</span>,
        }),
        h.display({
          id: 'method',
          header: 'Payment',
          cell: ({ row }) => {
            const method = row.original.payments[0]?.method
            return method ? (
              <Badge variant='outline' className='text-[10px]'>
                {METHOD_LABELS[method as PaymentMethod] ?? method}
              </Badge>
            ) : (
              <span className='text-muted-foreground text-xs'>—</span>
            )
          },
        }),
        h.accessor('totalAmount', {
          header: 'Total',
          cell: info => (
            <span className={`font-mono font-bold text-sm ${info.row.original.type === 'REFUND' ? 'text-destructive' : ''}`}>
              {PriceEngine.format(info.getValue())}
            </span>
          ),
        }),
        h.accessor('createdAt', {
          header: 'Date',
          cell: info => <span className='text-xs text-muted-foreground'>{dayjs(info.getValue()).format('MMM DD, YYYY HH:mm')}</span>,
        }),
      ]),
    [page, pageSize],
  )

  return (
    <div className='w-full h-screen bg-background flex overflow-hidden relative min-h-0 flex-1'>
      <div className='flex-1 min-w-0 h-full px-4 flex flex-col overflow-hidden transition-all duration-300 ease-in-out bg-background/50 space-y-2'>
        {/* Header */}
        <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
          <div>
            <h1 className='text-3xl font-bold tracking-tight text-foreground flex items-center gap-2'>
              <Receipt className='h-7 w-7 text-primary' />
              Transactions
            </h1>
            <p className='text-muted-foreground text-sm'>Full history of all sales, refunds, and adjustments.</p>
          </div>
          <Button size='sm' variant='outline' onClick={handleDownload}>
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
