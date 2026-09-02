import { Card, CardContent, CardHeader, CardTitle } from '@platform/components/ui/card'
import { ShoppingCart } from 'lucide-react'
import type { TransactionReport } from '../-utils/fetch-transaction-reports'

export function TotalTransactions({ transactions }: { transactions: TransactionReport[] }) {
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between pb-2'>
        <CardTitle className='text-sm font-medium'>Total Transactions</CardTitle>
        <ShoppingCart className='h-4 w-4 text-muted-foreground' />
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold'>{transactions.length}</div>
        <p className='text-[10px] text-muted-foreground'>Total orders processed</p>
      </CardContent>
    </Card>
  )
}
