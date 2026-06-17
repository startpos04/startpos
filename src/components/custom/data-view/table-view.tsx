import { type ColumnDef, flexRender } from '@tanstack/react-table'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { DataViewProps } from '.'
import { DataViewPagination } from './pagination'
import { useDataView } from './use-data-view'

export interface TableViewProps<T> extends DataViewProps<T> {
  // biome-ignore lint/suspicious/noExplicitAny: V (Value) must be any to allow columns to have different return types
  columns: ColumnDef<T, any>[]
  selectableRow?: {
    onClick: (product: T) => void
  }
}

const TableRowSkeleton = ({ columns }: { columns: number }) => (
  <>
    {[...Array(5).keys()].map(i => (
      <TableRow key={`skeleton-${i}`} className='border-0 even:bg-muted/30'>
        {[...Array(columns).keys()].map(j => (
          <TableCell key={`cell-${j}`} className='h-12 py-0.5'>
            <Skeleton className='w-full rounded-md h-4' />
          </TableCell>
        ))}
      </TableRow>
    ))}
  </>
)

export function TableView<T>(props: TableViewProps<T>) {
  const { data, className, isFetching, columns, renderEmpty, emptyMessage = 'No records found.', paginable, searchable, selectableRow } = props
  const table = useDataView<T>({ data, columns, paginable, searchable })

  return (
    <div className={cn('flex grow flex-col gap-2', className)}>
      <div className='rounded-xl border border-border bg-card shadow-sm grow h-1 overflow-auto relative'>
        <Table>
          <TableHeader className='bg-muted/50'>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id} className='hover:bg-transparent border-b border-border'>
                {headerGroup.headers.map(header => (
                  <TableHead key={header.id} className='text-muted-foreground font-semibold h-11 sticky top-0 bg-muted z-10'>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isFetching ? (
              <TableRowSkeleton columns={columns.length} />
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow
                  key={row.id}
                  className={cn('group border-0 transition-colors even:bg-muted/20 hover:bg-muted/50', selectableRow ? 'cursor-pointer' : '')}
                  onClick={() => selectableRow?.onClick(row.original)}
                >
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id} className='h-11 py-0.5'>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : null}
          </TableBody>
        </Table>
        {(isFetching && !data?.length) || table.getRowModel().rows?.length ? null : (
          <div className='h-full text-center text-muted-foreground absolute inset-0 flex items-center justify-center'>
            {renderEmpty ? renderEmpty() : emptyMessage}
          </div>
        )}
      </div>

      {paginable && <DataViewPagination table={table} totalItems={paginable.totalItems} />}
    </div>
  )
}
