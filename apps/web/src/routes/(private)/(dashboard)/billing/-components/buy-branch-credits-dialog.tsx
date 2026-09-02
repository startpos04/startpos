import { Button } from '@platform/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@platform/components/ui/dialog'
import { CreditCard, Zap } from 'lucide-react'
import type { MountProps } from '@/lib/mount-manager'

interface BuyBranchCreditsDialogProps extends MountProps {
  packageData: {
    credits: number
    price: number
    description: string
  }
}

export function BuyBranchCreditsDialog({ open, onClose, packageData }: BuyBranchCreditsDialogProps) {
  const handlePurchase = () => {
    // TODO: Implement actual purchase logic
    console.log('Purchasing credits:', packageData)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Zap className='h-5 w-5 text-amber-500' />
            Purchase Credits
          </DialogTitle>
          <DialogDescription>
            You're about to purchase {packageData.credits} credits for {packageData.price}.
          </DialogDescription>
        </DialogHeader>

        <div className='bg-muted/50 rounded-lg p-4 space-y-2'>
          <div className='flex items-center justify-between'>
            <span className='font-medium'>Credits:</span>
            <span>{packageData.credits}</span>
          </div>
          <div className='flex items-center justify-between'>
            <span className='font-medium'>Price:</span>
            <span className='font-bold'>{packageData.price}</span>
          </div>
          <div className='text-sm text-muted-foreground'>{packageData.description}</div>
        </div>

        <DialogFooter className='gap-2'>
          <Button variant='outline' onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handlePurchase} className='flex items-center gap-2'>
            <CreditCard className='h-4 w-4' />
            Purchase Credits
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
