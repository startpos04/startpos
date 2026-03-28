import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import dayjs from '@/lib/dayjs'
import { History } from 'lucide-react'

export function RecentMovements({ movements }: { movements: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-sm flex items-center gap-2'>
          <History className='h-4 w-4' /> Recent Movements
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        {movements.map(m => (
          <div key={m.id} className='flex justify-between items-start border-b pb-2 last:border-0'>
            <div>
              <p className='text-[11px] font-bold uppercase'>{m.type}</p>
              <p className='text-[10px] text-muted-foreground'>{dayjs(m.createdAt).fromNow()}</p>
            </div>
            <div className={`text-xs font-mono ${Number(m.quantity) > 0 ? 'text-emerald-600' : 'text-destructive'}`}>
              {Number(m.quantity) > 0 ? '+' : ''}
              {Number(m.quantity)}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
