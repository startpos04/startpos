import { getColumns } from '@/components/custom/data-view'
import TableView from '@/components/custom/data-view/table-view'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import dayjs from '@/lib/dayjs'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Edit, Trash2 } from 'lucide-react'
import { useMemo } from 'react'

export const Route = createFileRoute('/(private)/(dashboard)/(supervisor)/sales-reports')({
  component: RouteComponent,
})

function RouteComponent() {
  const { data, isFetching } = useQuery({
    queryKey: ['inventory-reports'],
    queryFn: async () => {
      const response = await crudAPI({
        data: {
          action: 'findMany',
          table: 'transaction',
          args: {
            include: {
              cashier: true,
              customer: true,
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      })
      return response as any[]
    },
  })

  const columns = useMemo(
    () =>
      getColumns<NonNullable<typeof data>[number]>(h => [
        h.display({
          id: 'number',
          maxSize: 20,
          header: 'No.',
          cell: info => <span className='text-xs font-mono text-muted-foreground/50'>{(info.row.index + 1).toString().padStart(2, '0')}</span>,
        }),
        h.accessor('invoiceNo', {
          header: 'Invoice #',
          cell: info => (
            <div className='flex flex-col'>
              <span className='font-bold text-foreground uppercase text-xs'>{info.row.original.invoiceNo.slice(-8)}</span>
              <span className='text-[10px] text-muted-foreground'>{dayjs(info.row.original.createdAt).format('MMM DD, YYYY')}</span>
            </div>
          ),
        }),
        h.accessor('customer.name', {
          header: 'Customer',
          cell: info => info.row.original.customer?.name || 'Walk-in',
        }),
        h.accessor('status', {
          header: 'Status',
          cell: info => {
            const status = info.getValue()
            return (
              <Badge variant={status === 'COMPLETED' ? 'secondary' : 'outline'} className='rounded-full font-medium text-[10px]'>
                {status}
              </Badge>
            )
          },
        }),
        h.accessor('paymentMethod', {
          header: 'Method',
          cell: info => <span className='capitalize text-muted-foreground italic'>{info.getValue() || 'N/A'}</span>,
        }),
        h.accessor('cashier.name', {
          header: 'Processed By',
          cell: info => (
            <div className='flex items-center gap-2'>
              <div className='h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary'>
                {info.row.original.cashier?.name?.charAt(0)}
              </div>
              <span className='text-sm'>{info.row.original.cashier?.name}</span>
            </div>
          ),
        }),
        h.accessor('totalAmount', {
          header: () => <div className='text-right'>Total</div>,
          cell: info => <div className='text-right font-bold text-foreground'>₱{Number(info.getValue()).toLocaleString()}</div>,
        }),
        h.display({
          id: 'actions',
          maxSize: 60,
          header: () => <div className='text-right pr-4'>Actions</div>,
          cell: ({ row }) => (
            <div className='flex justify-end gap-2 pr-2 opacity-0 group-hover:opacity-100 transition-opacity'>
              <Button variant='ghost' size='icon' className='h-8 w-8 rounded-full' onClick={() => console.log('Viewing Invoice', row.original.id)}>
                <Edit className='h-4 w-4' />
              </Button>
              <Button variant='ghost' size='icon' className='h-8 w-8 rounded-full text-destructive hover:text-destructive'>
                <Trash2 className='h-4 w-4' />
              </Button>
            </div>
          ),
        }),
      ]),
    [data],
  )

  return (
    <>
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight text-foreground'>Sales Reports</h1>
          <p className='text-muted-foreground text-sm'>Financial overview and transaction history for supervisors.</p>
        </div>
        <div className='flex gap-4'>
          <div className='bg-card border p-3 rounded-xl px-6'>
            <p className='text-[10px] uppercase text-muted-foreground font-semibold'>Total Revenue</p>
            <p className='text-xl font-bold text-emerald-500'>₱{data?.reduce((acc, curr) => acc + Number(curr.totalAmount), 0).toLocaleString() || 0}</p>
          </div>
        </div>
      </div>

      <TableView data={data} columns={columns} isFetching={isFetching} emptyMessage='No transactions found for this period.' />
    </>
  )
}
