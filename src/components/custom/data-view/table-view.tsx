import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'

interface TableViewProps<T> {
  data: T[] | undefined
  isFetching: boolean
  columns: ColumnDef<T, any>[]
  emptyMessage?: string
}

const TableRowSkeleton = ({ columns }: { columns: number }) => (
  <>
    {Array.from({ length: 5 }).map((_, i) => (
      <TableRow key={`skeleton-${i}`} className='border-0 even:bg-muted/30'>
        {Array.from({ length: columns }).map((_, j) => (
          <TableCell key={`cell-${j}`} className='h-12 py-0.5'>
            <Skeleton className='w-full rounded-md h-4' />
          </TableCell>
        ))}
      </TableRow>
    ))}
  </>
)

export function TableView<T>({ data, isFetching, columns, emptyMessage = 'No records found.' }: TableViewProps<T>) {
  const table = useReactTable({
    data: data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className='rounded-xl border border-border bg-card shadow-sm grow h-1 overflow-auto relative'>
      <Table>
        <TableHeader className='bg-muted/50'>
          {/* Removed sticky/top-0 from here */}
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
          {isFetching && !data?.length ? (
            <TableRowSkeleton columns={columns.length} />
          ) : table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map(row => (
              <TableRow key={row.id} className='group border-0 transition-colors even:bg-muted/20 hover:bg-muted/50'>
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
        <div className='h-full text-center text-muted-foreground absolute inset-0 flex items-center justify-center'>{emptyMessage}</div>
      )}
    </div>
  )
}

export default TableView
