import { getColumns } from '@/components/custom/data-view'
import { TableView } from '@/components/custom/data-view/table-view'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Edit, Plus, Trash2 } from 'lucide-react'
import { useMemo } from 'react'

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
          header: 'Employee',
        }),
        h.accessor('email', {
          header: 'Email',
        }),
        h.accessor('role', {
          maxSize: 100,
          header: 'Role',
          cell: info => <span className='capitalize text-slate-600'>{info.getValue()}</span>,
        }),
        h.display({
          maxSize: 100,
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

  return (
    <>
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight text-foreground'>Employees</h1>
          <p className='text-muted-foreground text-sm'>Manage your team and their workspace roles.</p>
        </div>
        <Button className='rounded-xl shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]'>
          <Plus className='mr-2 h-4 w-4' /> Add Employee
        </Button>
      </div>

      <TableView data={data} isFetching={isFetching} columns={columns} />
    </>
  )
}
