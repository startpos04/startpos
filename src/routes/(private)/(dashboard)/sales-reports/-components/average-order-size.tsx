import { ArrowUpRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@startpos-core/components/ui/card'
import { PriceEngine } from '@/lib/conversion/price-engine'
import type { TransactionReportStats } from '../-utils/calculate-stats'
import type { TransactionReport } from '../-utils/fetch-transaction-reports'

export function AverageOrderSize({ transactions, stats }: { transactions: TransactionReport[]; stats: TransactionReportStats }) {
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between pb-2'>
        <CardTitle className='text-sm font-medium'>Avg. Ticket Size</CardTitle>
        <ArrowUpRight className='h-4 w-4 text-muted-foreground' />
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold'>{PriceEngine.format(transactions.length ? stats.totalRevenue / transactions.length : 0)}</div>
        <p className='text-[10px] text-muted-foreground'>Average revenue per sale</p>
      </CardContent>
    </Card>
  )
}
