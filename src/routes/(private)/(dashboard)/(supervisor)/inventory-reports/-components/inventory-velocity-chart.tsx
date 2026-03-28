import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export function InventoryVelocityChart({ data }: { data: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-sm font-medium'>Inventory Velocity (7-Day Trend)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='h-[250px] w-full'>
          <ResponsiveContainer width='100%' height='100%'>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray='3 3' vertical={false} stroke='#f0f0f0' />
              <XAxis dataKey='date' fontSize={10} tickLine={false} axisLine={false} />
              <YAxis fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
              <Legend iconType='circle' wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
              <Line type='monotone' dataKey='incoming' stroke='#10b981' strokeWidth={2} dot={{ r: 4 }} name='Restocks' />
              <Line type='monotone' dataKey='outgoing' stroke='#ef4444' strokeWidth={2} dot={{ r: 4 }} name='Sales/Usage' />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
