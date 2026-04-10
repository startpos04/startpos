import { Button } from '@/components/ui/button'
import { useNavigate } from '@tanstack/react-router'
import { ShoppingCart } from 'lucide-react'

export const PosButton = function () {
  const navigate = useNavigate({ from: '/orders/' })

  return (
    <Button variant='ghost' className='h-10 w-10' onClick={() => navigate({ to: '/pos' })}>
      <ShoppingCart className='w-6! h-6!' />
    </Button>
  )
}
