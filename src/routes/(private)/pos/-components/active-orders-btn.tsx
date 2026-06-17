import { useQueryClient } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'
import { ReceiptText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { showModal } from '@/lib/overlay'
import { fetchActiveOrders } from '@/lib/queries/fetch-active-orders'
import { ActiveOrdersDialog } from '../../orders'

export const ActiveOrdersButton = () => {
  const queryClient = useQueryClient()
  const { data: orders = [] } = fetchActiveOrders()
  const { search: searchQuery } = useSearch({ from: '/(private)/pos/' })

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    showModal(ActiveOrdersDialog, {
      onCancel: async () => {
        await queryClient.invalidateQueries({ queryKey: ['pos-products', searchQuery] })
      },
    })
  }

  return (
    <div className='relative'>
      <a href='/orders' onClick={handleClick} className='contents'>
        <Button variant='ghost' className='h-10 w-10'>
          <ReceiptText className='w-6! h-6!' />
        </Button>
      </a>

      {orders.length > 0 && (
        <Badge className='absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 rounded-full border-2 border-card bg-primary text-[10px] font-black pointer-events-none'>
          {orders.length}
        </Badge>
      )}
    </div>
  )
}
