import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ColumnDef, createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { Edit, Trash2 } from 'lucide-react'
import { useMemo } from 'react'

export const getColumns = <T,>(columns: (helper: ReturnType<typeof createColumnHelper<T>>) => ColumnDef<T, any>[]) => {
  const helper = createColumnHelper<T>()
  return columns(helper)
}

const TableRowSkeleton = ({ columns }: { columns: number }) => (
  <>
    {Array.from({ length: 5 }).map((_, i) => (
      <TableRow key={`skeleton-${i}`} className='group border-0 transition-colors even:bg-muted/30 hover:bg-muted/60 data-[state=selected]:bg-muted'>
        {Array.from({ length: columns }).map((_, j) => (
          <TableCell key={`cell-${j}`} className='h-10.25 py-1'>
            <Skeleton className='w-full rounded-md bg-muted animate-pulse h-4' />
          </TableCell>
        ))}
      </TableRow>
    ))}
  </>
)

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/employees')({
  component: RouteComponent,
})

function RouteComponent() {
  const { data, isFetching } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      return await crudAPI({ data: { action: 'findMany', table: 'user' } })
    },
  })

  const columns = useMemo(
    () =>
      getColumns<NonNullable<typeof data>[number]>(h => [
        h.display({
          id: 'number',
          header: 'No.',
          cell: info => <span className='text-xs font-mono text-muted-foreground/50'>{(info.row.index + 1).toString().padStart(2, '0')}</span>,
        }),
        h.accessor('name', {
          header: 'Employee',
        }),
        h.accessor('role', {
          header: 'Role',
          cell: info => <span className='capitalize text-slate-600'>{info.getValue()}</span>,
        }),
        h.display({
          id: 'actions',
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

  const table = useReactTable({
    data: data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <>
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight text-foreground'>Employees</h1>
          <p className='text-muted-foreground text-sm'>Manage your team and their workspace roles.</p>
        </div>
        <Button className='rounded-xl shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]'>+ Add Employee</Button>
      </div>

      <div className='rounded-md border border-border bg-card shadow-sm overflow-hidden'>
        <Table>
          <TableHeader className='bg-muted/50'>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id} className='hover:bg-transparent border-0'>
                {headerGroup.headers.map(header => (
                  <TableHead key={header.id} className='text-muted-foreground font-semibold h-10.25 py-1'>
                    {flexRender(header.column.columnDef.header, header.getContext())}
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
                <TableRow key={row.id} className='group border-0 transition-colors even:bg-muted/30 hover:bg-muted/60 data-[state=selected]:bg-muted'>
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id} className='h-10.25 py-1'>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className='text-center text-muted-foreground'>
                  No employees found in the database.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
