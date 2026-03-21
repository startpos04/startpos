import { Skeleton } from '@/components/ui/skeleton'
import { ColumnDef, getCoreRowModel, Row, useReactTable } from '@tanstack/react-table'

interface GridViewProps<T> {
  data: T[] | undefined
  isFetching: boolean
  columns: ColumnDef<T, any>[]
  renderCard: (row: Row<T>) => React.ReactNode
  emptyMessage?: string
}

const GridSkeleton = () => (
  <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
    {Array.from({ length: 8 }).map((_, i) => (
      <Skeleton key={i} className='h-48 w-full rounded-2xl' />
    ))}
  </div>
)

export function GridView<T>({ data, isFetching, columns, renderCard, emptyMessage = 'No records found.' }: GridViewProps<T>) {
  const table = useReactTable({
    data: data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className='grow h-1 overflow-auto'>
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
  )
}

export default GridView
