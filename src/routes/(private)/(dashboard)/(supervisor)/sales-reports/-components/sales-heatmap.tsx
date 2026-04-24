import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Timer } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { TransactionReportStats } from '../-utils/calculate-stats'

export function SalesHeatmap({ stats }: { stats: TransactionReportStats }) {
  return (
    <Card className='md:col-span-2'>
      <CardHeader className='flex flex-row items-center justify-between'>
        <div>
          <CardTitle className='flex items-center gap-2'>
            <Timer className='h-5 w-5 text-blue-500' /> Sales Heatmap
          </CardTitle>
          <CardDescription>Hourly revenue distribution</CardDescription>
        </div>
      </CardHeader>
      <CardContent className='h-62.5'>
        <ResponsiveContainer width='100%' height='100%'>
          <BarChart data={stats.activeHours}>
            <CartesianGrid strokeDasharray='3 3' vertical={false} className='stroke-muted/30' />
            <XAxis dataKey='time' fontSize={10} tickLine={false} axisLine={false} className='fill-muted-foreground' />
            <YAxis hide />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className='rounded-lg border border-border bg-background p-3 shadow-md ring-1 ring-black/5'>
                      <p className='text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1'>Time: {label}</p>
                      <div className='flex items-center gap-2'>
                        <div className='h-2 w-2 rounded-full bg-primary' />
                        <span className='text-sm font-bold text-foreground'>₱{payload[0]?.value?.toLocaleString()}</span>
                      </div>
                    </div>
                  )
                }
                return null
              }}
            />
            <Bar dataKey='amount' fill='currentColor' className='fill-primary' radius={[4, 4, 0, 0]} barSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
