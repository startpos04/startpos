import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PriceEngine } from '@/lib/conversion/price-engine'
import { Wallet } from 'lucide-react'
import { useState } from 'react'

interface PaymentDialogProps {
  open: boolean
  onClose: () => void
  total: number
  onConfirm: (tendered: number) => void
  disabled?: boolean
}

export function PaymentDialog({ open, onClose, total, onConfirm }: PaymentDialogProps) {
  const [tendered, setTendered] = useState<number>(0)

  const change = tendered - total
  const canSubmit = tendered >= total

  const handleFinalSubmit = async () => {
    await onConfirm(tendered)
    onClose()
    setTendered(0)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-106.25  p-8'>
        <DialogHeader>
          <DialogTitle className='text-2xl font-black text-center'>Finalize Payment</DialogTitle>
        </DialogHeader>

        <div className='py-6 space-y-6'>
          <div className='text-center p-4 bg-muted rounded-2xl'>
            <p className='text-sm text-muted-foreground font-bold uppercase'>Total Amount Due</p>
            <p className='text-4xl font-black text-primary'>{PriceEngine.format(total)}</p>
          </div>

          <div className='space-y-2'>
            <label className='text-sm font-bold ml-1'>Cash Received</label>
            <div className='relative'>
              <Wallet className='absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5' />
              <Input
                type='number'
                className='h-16 pl-12 text-2xl font-black rounded-xl border-2'
                placeholder='0.00'
                autoFocus
                value={tendered / 100 || ''}
                onChange={e => setTendered(Number(e.target.value) * 100)}
              />
            </div>
          </div>

          <div className='grid grid-cols-3 gap-2'>
            {[100, 200, 500, 1000].map(val => (
              <Button key={val} variant='outline' onClick={() => setTendered(prev => prev + val * 100)}>
                +{val}
              </Button>
            ))}
            <Button variant='ghost' className='text-destructive' onClick={() => setTendered(0)}>
              Clear
            </Button>
          </div>

          {tendered > 0 && (
            <div className='flex justify-between items-center p-4 border-2 border-dashed rounded-2xl'>
              <span className='font-bold'>Change:</span>
              <span className={`text-2xl font-black ${change < 0 ? 'text-destructive' : 'text-green-600'}`}>{PriceEngine.format(Math.max(0, change))}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button disabled={!canSubmit} onClick={handleFinalSubmit} className='w-full h-16 rounded-xl text-xl font-black bg-green-600 hover:bg-green-700'>
            Complete Transaction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
