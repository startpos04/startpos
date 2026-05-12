import { type ColumnDef, getCoreRowModel, type Row, useReactTable } from '@tanstack/react-table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface GridViewProps<T> {
  data: T[] | undefined
  isFetching: boolean
  // biome-ignore lint/suspicious/noExplicitAny: V (Value) must be any to allow columns to have different return types
  columns: ColumnDef<T, any>[]
  renderCard: (row: Row<T>) => React.ReactNode
  emptyMessage?: string
  className?: string
}

const GridSkeleton = () => (
  <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
    {[...Array(8).keys()].map(value => (
      <Skeleton key={value} className='h-48 w-full rounded-2xl' />
    ))}
  </div>
)

export function GridView<T>({ data, isFetching, columns, renderCard, className, emptyMessage = 'No records found.' }: GridViewProps<T>) {
  const table = useReactTable({
    data: data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <ScrollArea className={cn('flex-1 min-h-0 w-full', className)}>
      <div className='p-1'>
        {isFetching && !data?.length ? (
          <GridSkeleton />
        ) : table.getRowModel().rows?.length ? (
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
            {table.getRowModel().rows.map(row => (
              <div key={row.id} className='h-full'>
                {renderCard(row)}
              </div>
            ))}
          </div>
        ) : (
          <div className='flex h-40 items-center justify-center rounded-2xl border-2 border-dashed border-border text-muted-foreground'>{emptyMessage}</div>
        )}
      </div>
    </ScrollArea>
  )
}

export default GridView
