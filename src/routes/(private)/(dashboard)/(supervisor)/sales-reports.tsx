import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createFileRoute } from '@tanstack/react-router'
import { Mail, MoreHorizontal } from 'lucide-react'

// Updated data for Employees
const employees = [
  {
    id: 'EMP001',
    name: 'Alex Rivera',
    role: 'Manager',
    status: 'On Shift',
    email: 'alex@brewpos.com',
    performance: 'Top Tier',
  },
  {
    id: 'EMP002',
    name: 'Sarah Chen',
    role: 'Barista',
    status: 'Break',
    email: 'sarah.c@brewpos.com',
    performance: 'Consistent',
  },
  {
    id: 'EMP003',
    name: 'Jordan Smith',
    role: 'Server',
    status: 'Off Duty',
    email: 'j.smith@brewpos.com',
    performance: 'Improving',
  },
  {
    id: 'EMP004',
    name: 'Maria Garcia',
    role: 'Barista',
    status: 'On Shift',
    email: 'm.garcia@brewpos.com',
    performance: 'Top Tier',
  },
]

export const Route = createFileRoute('/(private)/(dashboard)/(supervisor)/sales-reports')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <>
      <div className='flex justify-between items-center'>
        <h1 className='text-2xl font-bold tracking-tight'>Team Members</h1>
        <Button className='rounded-xl shadow-md'>+ Add Employee</Button>
      </div>

      <div className='bg-white rounded-[2rem] shadow-sm border overflow-hidden'>
        <Table>
          <TableHeader className='bg-slate-50/50'>
            <TableRow className='hover:bg-transparent border-none'>
              <TableHead className='w-[300px] pl-6'>Employee</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Performance</TableHead>
              <TableHead className='text-right pr-6'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map(emp => (
              <TableRow key={emp.id} className='group border-slate-50 hover:bg-slate-50/50 transition-colors'>
                <TableCell className='pl-6 py-4'>
                  <div className='flex items-center gap-3'>
                    <Avatar className='h-10 w-10 border-2 border-white shadow-sm'>
                      <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${emp.name}`} />
                      <AvatarFallback>{emp.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className='flex flex-col'>
                      <span className='font-semibold text-slate-900'>{emp.name}</span>
                      <span className='text-xs text-slate-400 font-mono'>{emp.id}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className='font-medium text-slate-600'>{emp.role}</TableCell>
                <TableCell>
                  <Badge
                    className={`rounded-full px-3 py-0.5 font-medium border-none ${
                      emp.status === 'On Shift'
                        ? 'bg-emerald-100 text-emerald-700'
                        : emp.status === 'Break'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {emp.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className={`text-sm ${emp.performance === `Top Tier` ? `text-indigo-600 font-bold` : `text-slate-500`}`}>{emp.performance}</span>
                </TableCell>
                <TableCell className='text-right pr-6'>
                  <div className='flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity'>
                    <Button variant='ghost' size='icon' className='h-8 w-8 rounded-full'>
                      <Mail className='h-4 w-4' />
                    </Button>
                    <Button variant='ghost' size='icon' className='h-8 w-8 rounded-full'>
                      <MoreHorizontal className='h-4 w-4' />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
