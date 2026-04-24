import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import dayjs from '@/lib/dayjs'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { TransactionReportStats } from '../-utils/calculate-stats'

export function RevenueVsCostTrend({ stats }: { stats: TransactionReportStats }) {
  return (
    <Card className='md:col-span-2'>
      <CardHeader>
        <CardTitle>Revenue vs Cost Trend</CardTitle>
        <CardDescription>Daily financial performance overview</CardDescription>
      </CardHeader>
      <CardContent className='h-80'>
        {' '}
        {/* Increased height slightly for better visibility */}
        <ResponsiveContainer width='100%' height='100%'>
          <AreaChart data={stats.chartData}>
            <defs>
              <linearGradient id='colorRev' x1='0' y1='0' x2='0' y2='1'>
                {/* Using emerald-500 equivalent for the gradient */}
                <stop offset='5%' stopColor='#10b981' stopOpacity={0.3} />
                <stop offset='95%' stopColor='#10b981' stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* Fix: Use muted-foreground for grid lines so they adapt to dark mode */}
            <CartesianGrid strokeDasharray='3 3' vertical={false} className='stroke-muted/30' />

            <XAxis
              dataKey='date'
              fontSize={12}
              tickLine={false}
              axisLine={false}
              className='fill-muted-foreground'
              tickFormatter={str => dayjs(str).format('MMM DD')}
            />
            <YAxis hide />

            {/* Fix: Integrated Custom Tooltip */}
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className='rounded-lg border border-border bg-background p-3 shadow-xl'>
                      <p className='text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2'>{dayjs(label).format('MMMM DD, YYYY')}</p>
                      <div className='space-y-1.5'>
                        <div className='flex items-center justify-between gap-8'>
                          <div className='flex items-center gap-2'>
                            <div className='h-2 w-2 rounded-full bg-emerald-500' />
                            <span className='text-xs text-muted-foreground'>Revenue</span>
                          </div>
                          <span className='text-xs font-bold text-foreground'>₱{payload[0]?.value?.toLocaleString()}</span>
                        </div>
                        <div className='flex items-center justify-between gap-8'>
                          <div className='flex items-center gap-2'>
                            <div className='h-2 w-2 rounded-full bg-rose-500' />
                            <span className='text-xs text-muted-foreground'>Cost</span>
                          </div>
                          <span className='text-xs font-bold text-foreground'>₱{payload[1]?.value?.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  )
                }
                return null
              }}
            />

            <Area type='monotone' dataKey='revenue' stroke='#10b981' fillOpacity={1} fill='url(#colorRev)' strokeWidth={2} name='Revenue' />
            <Area type='monotone' dataKey='cost' stroke='#ef4444' fill='transparent' strokeDasharray='5 5' strokeWidth={2} name='Cost' />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
