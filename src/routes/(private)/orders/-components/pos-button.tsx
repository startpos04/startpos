import { useNavigate } from '@tanstack/react-router'
import { ShoppingCart } from 'lucide-react'
import { Button } from '@startpos-core/components/ui/button'

export const PosButton = () => {
  const navigate = useNavigate({ from: '/orders/' })

  return (
    <Button variant='ghost' className='h-10 w-10' onClick={() => navigate({ to: '/pos' })}>
      <ShoppingCart className='w-6! h-6!' />
    </Button>
  )
}
