import type { Row } from '@tanstack/react-table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { DataViewProps } from '.'
import { DataViewPagination } from './pagination'
import { useDataView } from './use-data-view'

export interface GridViewProps<T> extends DataViewProps<T> {
  renderCard: (row: Row<T>) => React.ReactNode
}

const GridSkeleton = () => (
  <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
    {[...Array(8).keys()].map(value => (
      <Skeleton key={value} className='h-48 w-full rounded-2xl' />
    ))}
  </div>
)

export function GridView<T>({ data, isFetching, renderCard, className, emptyMessage = 'No records found.', paginable }: GridViewProps<T>) {
  const table = useDataView<T>({ data, columns: [], paginable })

  return (
    <div className={cn('flex grow flex-col min-h-0 w-full gap-2', className)}>
      <ScrollArea className='flex-1 min-h-0 w-full'>
        <div className='p-1'>
          {isFetching ? (
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
      {paginable && <DataViewPagination table={table} totalItems={paginable.totalItems} />}
    </div>
  )
}
