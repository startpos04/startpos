import { getColumns } from '@/components/custom/data-view'
import TableView from '@/components/custom/data-view/table-view'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import dayjs from '@/lib/dayjs'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Calendar, Edit, Trash2 } from 'lucide-react'
import { useMemo } from 'react'

export const Route = createFileRoute('/(private)/(dashboard)/(supervisor)/inventory-reports')({
  component: InventoryReportComponent,
})

function InventoryReportComponent() {
  const { data, isFetching } = useQuery({
    queryKey: ['inventory-report-data'],
    queryFn: async () => {
      const resp = await crudAPI({
        data: {
          action: 'findMany',
          table: 'product',
          args: {
            where: { type: { not: 'SERVICE' } },
            include: { category: true, inventory: true },
          },
        },
      })
      return resp as any[]
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
        h.accessor('image', {
          header: 'Avatar',
          maxSize: 20,
          cell: info => {
            const user = info.row.original
            return (
              <Avatar className='h-9 w-9 border border-border/50 shadow-sm'>
                <AvatarImage src={user.image ?? ''} alt={user.name} />
                <AvatarFallback className='bg-primary/5 text-primary text-xs font-bold'>{user.name?.charAt(0)}</AvatarFallback>
              </Avatar>
            )
          },
        }),
        h.accessor('name', {
          header: 'Product Item',
          cell: info => (
            <div className='flex flex-col'>
              <span className='font-bold text-sm text-foreground'>{info.row.original.name}</span>
              <span className='text-[10px] font-mono text-muted-foreground uppercase tracking-tight'>SKU: {info.row.original.sku || 'N/A'}</span>
            </div>
          ),
        }),
        h.accessor('category.name', {
          header: 'Category',
          cell: info => (
            <Badge variant='secondary' className='text-[10px] uppercase font-semibold py-0'>
              {info.row.original.category?.name}
            </Badge>
          ),
        }),
        h.display({
          id: 'stock_status',
          header: 'Inventory Status',
          cell: ({ row }) => {
            const totalStock = row.original.inventory?.reduce((acc: number, curr: any) => acc + Number(curr.quantity), 0) || 0
            const isLow = totalStock < 15

            return (
              <div className='w-[140px] space-y-1.5'>
                <div className='flex justify-between text-[11px] font-medium'>
                  <span className={isLow ? 'text-destructive font-bold' : 'text-muted-foreground'}>{totalStock} in stock</span>
                  <span className='text-[9px] uppercase text-muted-foreground/70'>{isLow ? 'Restock' : 'Healthy'}</span>
                </div>
                <Progress value={Math.min((totalStock / 50) * 100, 100)} className={`h-1.5 ${isLow ? '[&>div]:bg-destructive' : '[&>div]:bg-primary'}`} />
              </div>
            )
          },
        }),
        h.display({
          id: 'expiry',
          header: 'Expiry Tracking',
          cell: ({ row }) => {
            if (!row.original.hasExpiry) return <span className='text-muted-foreground text-xs italic'>Non-perishable</span>

            const batches = row.original.inventory?.filter((i: any) => i.expiryDate)
            if (!batches?.length)
              return (
                <Badge variant='outline' className='text-[9px] text-amber-500 border-amber-500/30'>
                  No Batch Data
                </Badge>
              )

            const earliestDate = batches.reduce((min: string, b: any) => (dayjs(b.expiryDate).isBefore(dayjs(min)) ? b.expiryDate : min), batches[0].expiryDate)
            const isExpiringSoon = dayjs(earliestDate).isBefore(dayjs().add(30, 'day'))
            const isExpired = dayjs(earliestDate).isBefore(dayjs())

            return (
              <div
                className={`flex items-center gap-1.5 text-xs font-medium ${isExpired ? 'text-destructive' : isExpiringSoon ? 'text-amber-500' : 'text-muted-foreground'}`}
              >
                <Calendar className='h-3.5 w-3.5' />
                {dayjs(earliestDate).format('MMM DD, YYYY')}
              </div>
            )
          },
        }),
        h.display({
          id: 'last_update',
          header: 'Last Restock',
          cell: ({ row }) => {
            const lastRestock = row.original.inventory?.[0]?.lastRestocked
            return <span className='text-[11px] text-muted-foreground'>{lastRestock ? dayjs(lastRestock).fromNow() : 'No records'}</span>
          },
        }),
        h.display({
          id: 'actions',
          maxSize: 80,
          header: () => <div className='text-right pr-4'>Actions</div>,
          cell: ({ row }) => (
            <div className='flex justify-end gap-2 pr-2 opacity-0 group-hover:opacity-100 transition-opacity'>
              <Button variant='ghost' size='icon' className='h-8 w-8 rounded-full' onClick={() => console.log('Editing', row.original.id)}>
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
    <div className='flex flex-1 flex-col gap-4'>
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight text-foreground'>Inventory Report</h1>
          <p className='text-muted-foreground text-sm'>Physical stock audit, batch expiration, and warehouse locations.</p>
        </div>

        <div className='flex bg-muted/30 border border-border p-1 rounded-xl'>
          <div className='px-4 py-2 text-center border-r border-border'>
            <p className='text-[10px] uppercase font-bold text-muted-foreground'>Total SKUs</p>
            <p className='text-lg font-bold'>{data?.length || 0}</p>
          </div>
          <div className='px-4 py-2 text-center'>
            <p className='text-[10px] uppercase font-bold text-muted-foreground'>Low Stock</p>
            <p className='text-lg font-bold text-destructive'>
              {data?.filter(p => p.inventory?.reduce((a: any, c: any) => a + Number(c.quantity), 0) < 15).length || 0}
            </p>
          </div>
        </div>
      </div>

      <TableView data={data} columns={columns} isFetching={isFetching} emptyMessage='No physical stock records found.' />
    </div>
  )
}
