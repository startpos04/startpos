import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6']

export function CategoryMixChart({ data }: { data: any[] }) {
  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-sm'>Category Mix</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='h-40'>
          <ResponsiveContainer width='100%' height='100%'>
            <PieChart>
              <Pie data={data.map((entry, i) => ({ ...entry, fill: COLORS[i % COLORS.length] }))} innerRadius={40} outerRadius={60} dataKey='value' />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className='space-y-1 mt-2'>
          {data.map((c, i) => (
            <div key={c.name} className='flex justify-between text-[10px] uppercase font-bold text-muted-foreground'>
              <span className='flex items-center gap-1'>
                <div className='w-2 h-2 rounded-full' style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                {c.name}
              </span>
              <span>{c.value} Items</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
