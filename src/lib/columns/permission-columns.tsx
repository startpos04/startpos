/** biome-ignore-all lint/suspicious/noExplicitAny: TODO: fix */
import type { ColumnHelper } from '@tanstack/react-table'
import { Shield, ShieldCheck, Users } from 'lucide-react'
import { Badge } from '@startpos-core/components/ui/badge'
import type { PermissionWithEmployees } from '@/lib/queries/permission-management'

export const permissionCols = {
  name: (h: ColumnHelper<PermissionWithEmployees>) =>
    h.accessor('name', {
      header: 'Permission Name',
      cell: info => (
        <div className='flex items-center gap-2'>
          <Shield className='h-4 w-4 text-primary shrink-0' />
          <span className='font-semibold text-foreground'>{info.getValue()}</span>
        </div>
      ),
    }),

  description: (h: ColumnHelper<PermissionWithEmployees>) =>
    h.accessor('description', {
      header: 'Description',
      cell: info => {
        const description = info.getValue()
        return description ? (
          <span className='text-sm text-muted-foreground'>{description}</span>
        ) : (
          <span className='text-xs text-muted-foreground italic'>No description</span>
        )
      },
    }),

  key: (h: ColumnHelper<PermissionWithEmployees>) =>
    h.accessor('key', {
      header: 'Key',
      cell: info => (
        <Badge variant='outline' className='font-mono text-xs'>
          {info.getValue()}
        </Badge>
      ),
    }),

  scope: (h: ColumnHelper<PermissionWithEmployees>) =>
    h.accessor('scope', {
      header: 'Scope',
      cell: info => (
        <Badge variant='secondary' className='text-xs'>
          {info.getValue()}
        </Badge>
      ),
    }),

  category: (h: ColumnHelper<PermissionWithEmployees>) =>
    h.accessor('category', {
      header: 'Category',
      cell: info => {
        const category = info.getValue()
        return category ? (
          <Badge variant='outline' className='text-xs'>
            {category}
          </Badge>
        ) : (
          <span className='text-xs text-muted-foreground'>-</span>
        )
      },
    }),

  action: (h: ColumnHelper<PermissionWithEmployees>) =>
    h.accessor('action', {
      header: 'Action',
      cell: info => <span className='text-xs text-muted-foreground uppercase'>{info.getValue()}</span>,
    }),

  resource: (h: ColumnHelper<PermissionWithEmployees>) =>
    h.accessor('resource', {
      header: 'Resource',
      cell: info => <span className='text-xs text-muted-foreground uppercase'>{info.getValue()}</span>,
    }),

  employees: (h: ColumnHelper<PermissionWithEmployees>) =>
    h.display({
      id: 'employees',
      header: () => (
        <div className='flex items-center gap-2'>
          <Users className='h-4 w-4' />
          <span>Custom Assignments</span>
        </div>
      ),
      cell: info => {
        const permission = info.row.original
        const totalGrants = permission.employeesWithGrant.length
        const totalRevokes = permission.employeesWithRevoke.length

        return (
          <div className='flex items-center gap-2'>
            {totalGrants > 0 && (
              <Badge variant='default' className='gap-1 bg-green-600 hover:bg-green-700'>
                <ShieldCheck className='h-3 w-3' />
                {totalGrants} {totalGrants === 1 ? 'Grant' : 'Grants'}
              </Badge>
            )}
            {totalRevokes > 0 && (
              <Badge variant='destructive' className='gap-1'>
                <Shield className='h-3 w-3' />
                {totalRevokes} {totalRevokes === 1 ? 'Revoke' : 'Revokes'}
              </Badge>
            )}
            {totalGrants === 0 && totalRevokes === 0 && (
              <Badge variant='outline' className='gap-1 text-muted-foreground'>
                <Shield className='h-3 w-3' />
                No custom assignments
              </Badge>
            )}
          </div>
        )
      },
    }),
}
