import { Zap } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { TransactionReportStats } from '../-utils/calculate-stats'

export function TopSellers({ stats }: { stats: TransactionReportStats }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Zap className='h-5 w-5 text-yellow-500' /> Top Sellers
        </CardTitle>
        <CardDescription>By units sold</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='space-y-4'>
          {stats.topProducts.map(product => (
            <div key={product.name} className='flex items-center justify-between'>
              <div className='space-y-1'>
                <p className='text-sm font-medium leading-none'>{product.name}</p>
                <p className='text-xs text-muted-foreground'>{product.qty} units</p>
              </div>
              <div className='text-sm font-bold text-emerald-600'>₱{product.revenue.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
