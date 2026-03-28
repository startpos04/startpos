import { Button } from '@/components/ui/button'
import dayjs from '@/lib/dayjs'
import { Download, History, PackageCheck } from 'lucide-react'

export function InventoryHeader() {
  return (
    <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
      <div>
        <h1 className='text-3xl font-bold tracking-tight text-foreground'>Inventory Reports</h1>
        <p className='text-muted-foreground text-sm flex items-center gap-2'>
          <PackageCheck className='h-4 w-4 text-emerald-500' />
          Live stock audit for {dayjs().format('MMMM DD, YYYY')}
        </p>
      </div>
      <div className='flex gap-2'>
        <Button variant='outline' size='sm'>
          <History className='mr-2 h-4 w-4' /> Movement Logs
        </Button>
        <Button size='sm'>
          <Download className='mr-2 h-4 w-4' /> Export Audit
        </Button>
      </div>
    </div>
  )
}
