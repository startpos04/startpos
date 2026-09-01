import { TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@startpos-core/components/ui/card'
import { PriceEngine } from '@/lib/conversion/price-engine'
import type { TransactionReportStats } from '../-utils/calculate-stats'

export function GrossProfit({ stats }: { stats: TransactionReportStats }) {
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between pb-2'>
        <CardTitle className='text-sm font-medium'>Gross Profit</CardTitle>
        <TrendingUp className='h-4 w-4 text-emerald-500' />
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold'>{PriceEngine.format(stats.grossProfit)}</div>
        <p className='text-[10px] text-emerald-500 font-medium'>{stats.margin.toFixed(1)}% Avg Margin</p>
      </CardContent>
    </Card>
  )
}
