/**
 * Employee Performance Tab
 *
 * Displays revenue statistics, target achievement, and lifetime activity metrics
 */

import { Progress } from '@platform/components/ui/progress'
import { Separator } from '@platform/components/ui/separator'
import { Package, Receipt, Smartphone } from 'lucide-react'

interface PerformanceTabProps {
  employee: any
  totalRevenue: number
  targetReached: number
}

export function PerformanceTab({ employee, totalRevenue, targetReached }: PerformanceTabProps) {
  return (
    <div className='space-y-5'>
      {/* Revenue */}
      <div className='space-y-3'>
        <h4 className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2'>
          <Receipt className='w-3 h-3' /> Transaction Summary
        </h4>
        <div className='rounded-xl border bg-primary/5 border-primary/20 p-3'>
          <div className='flex items-center justify-between'>
            <p className='text-xs font-medium text-muted-foreground'>Total Revenue</p>
            <Receipt className='h-3.5 w-3.5 text-primary' />
          </div>
          <p className='text-xl font-bold mt-1'>â‚±{totalRevenue.toLocaleString()}</p>
          <div className='mt-2 space-y-1'>
            <div className='flex justify-between text-[10px] text-muted-foreground'>
              <span>Target Achievement</span>
              <span>{targetReached}%</span>
            </div>
            <Progress value={targetReached} className='h-1' />
          </div>
        </div>
      </div>

      <Separator />

      {/* Stats */}
      <div className='space-y-3'>
        <h4 className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>Lifetime Stats</h4>
        <div className='grid grid-cols-2 gap-2'>
          <div className='rounded-xl border bg-card p-3'>
            <div className='flex items-center justify-between text-muted-foreground mb-1'>
              <p className='text-[10px] font-medium uppercase'>Services</p>
              <Smartphone className='h-3 w-3' />
            </div>
            <p className='text-xl font-bold'>{employee.performedServices[0]?.count || 0}</p>
            <p className='text-[10px] text-muted-foreground'>Lifetime</p>
          </div>
          <div className='rounded-xl border bg-card p-3'>
            <div className='flex items-center justify-between text-muted-foreground mb-1'>
              <p className='text-[10px] font-medium uppercase'>Inventory</p>
              <Package className='h-3 w-3' />
            </div>
            <p className='text-xl font-bold'>{employee.inventoryMovements[0]?.count || 0}</p>
            <p className='text-[10px] text-muted-foreground'>Adjustments</p>
          </div>
        </div>
      </div>

      <Separator />

      <div className='h-32 flex items-center justify-center border-2 border-dashed rounded-xl'>
        <p className='text-xs text-muted-foreground text-center px-4'>Activity chart coming soon.</p>
      </div>
    </div>
  )
}
