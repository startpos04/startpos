import { Avatar, AvatarFallback } from '@platform/components/ui/avatar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@platform/components/ui/card'
import { Progress } from '@platform/components/ui/progress'
import { Users } from 'lucide-react'
import type { TransactionReportStats } from '../-utils/calculate-stats'

export function StaffPerformance({ stats }: { stats: TransactionReportStats }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Users className='h-5 w-5 text-purple-500' /> Staff Performance
        </CardTitle>
        <CardDescription>Revenue processed per cashier</CardDescription>
      </CardHeader>
      <CardContent>
        {stats.topCashiers.map(cashier => (
          <div key={cashier.name} className='flex items-center gap-4'>
            <Avatar className='h-10 w-10 border'>
              <AvatarFallback className='bg-primary/5 text-primary text-xs'>{cashier.name.substring(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className='flex-1 space-y-1'>
              <div className='flex items-center justify-between'>
                <p className='text-sm font-bold'>{cashier.name}</p>
                <span className='text-xs font-medium'>₱{cashier.total.toLocaleString()}</span>
              </div>
              <Progress value={(cashier.total / (stats.topCashiers[0]?.total || 0) || 0) * 100} className='h-1' />
              <p className='text-[10px] text-muted-foreground'>{cashier.count} transactions</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
