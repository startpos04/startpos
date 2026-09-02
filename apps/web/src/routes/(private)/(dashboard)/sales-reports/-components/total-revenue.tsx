import { Card, CardContent, CardHeader, CardTitle } from '@platform/components/ui/card'
import { DollarSign } from 'lucide-react'
import { PriceEngine } from '@/lib/conversion/price-engine'
import type { TransactionReportStats } from '../-utils/calculate-stats'

export function TotalRevenue({ stats }: { stats: TransactionReportStats }) {
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between pb-2'>
        <CardTitle className='text-sm font-medium'>Total Revenue</CardTitle>
        <DollarSign className='h-4 w-4 text-muted-foreground' />
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold'>{PriceEngine.format(stats.totalRevenue)}</div>
        <p className='text-[10px] text-muted-foreground'>Gross sales across all channels</p>
      </CardContent>
    </Card>
  )
}
