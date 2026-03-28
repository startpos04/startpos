import { Card, CardContent } from '@/components/ui/card'
import { CURRENCY } from '@/lib/constants'
import { Archive, Box, ShieldAlert, TrendingDown } from 'lucide-react'
import numeral from 'numeral'

interface StatsProps {
  audit: {
    totalValue: number
    lowStockCount: number
    expiringSoon: number
  }
  productCount: number
}

export function InventoryStats({ audit, productCount }: StatsProps) {
  return (
    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
      <StatCard
        title='Warehouse Value'
        value={`${CURRENCY}${numeral(audit.totalValue).format('0,0.00')}`}
        sub='Total capital in stock'
        icon={<Archive className='text-blue-500' />}
      />
      <StatCard
        title='Low Stock Alerts'
        value={audit.lowStockCount}
        sub='Items below threshold'
        icon={<TrendingDown className='text-destructive' />}
        isCritical={audit.lowStockCount > 0}
      />
      <StatCard title='Expiring Soon' value={audit.expiringSoon} sub='Within 30 days' icon={<ShieldAlert className='text-amber-500' />} />
      <StatCard title='Active SKUs' value={productCount} sub='Across all categories' icon={<Box className='text-purple-500' />} />
    </div>
  )
}

function StatCard({ title, value, sub, icon, isCritical }: any) {
  return (
    <Card className={isCritical ? 'border-destructive/50 bg-destructive/5' : ''}>
      <CardContent className='pt-6'>
        <div className='flex items-center justify-between'>
          <div className='space-y-1'>
            <p className='text-xs font-medium text-muted-foreground uppercase'>{title}</p>
            <p className='text-2xl font-bold tracking-tight'>{value}</p>
            <p className='text-[10px] text-muted-foreground italic'>{sub}</p>
          </div>
          <div className='h-10 w-10 bg-muted/50 rounded-full flex items-center justify-center'>{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}
