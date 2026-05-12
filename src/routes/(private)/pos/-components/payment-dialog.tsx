import { ArrowRight, CheckCircle2, RotateCcw, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PriceEngine } from '@/lib/conversion/price-engine'

interface PaymentDialogProps {
  open: boolean
  onClose: () => void
  total: number
  onConfirm: (tendered: number) => void
  onSave: () => void
  disabled?: boolean
}

export function PaymentDialog({ open, onClose, total, onConfirm, onSave }: PaymentDialogProps) {
  const [tendered, setTendered] = useState<number>(0)

  const change = tendered - total
  const canSubmit = tendered >= total

  const handleFinalSubmit = async () => {
    await onConfirm(tendered)
    onClose()
    setTendered(0)
  }

  const handlePayLater = () => {
    if (onSave) onSave()
    onClose()
    setTendered(0)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-106.25 p-6 md:p-8 overflow-hidden bg-background'>
        <DialogHeader>
          <DialogTitle className='text-2xl font-black text-center'>Checkout Summary</DialogTitle>
        </DialogHeader>

        <div className='py-4 space-y-6'>
          {/* Amount Summary Card */}
          <div className='text-center p-5 bg-muted/50 rounded-2xl border border-border'>
            <p className='text-xs text-muted-foreground font-bold uppercase tracking-widest'>Amount to Pay</p>
            <p className='text-4xl font-black text-foreground'>{PriceEngine.format(total)}</p>
          </div>

          {/* Cash Input Section */}
          <div className='space-y-2'>
            <div className='flex justify-between items-end px-1'>
              <label htmlFor='cash-input' className='text-sm font-bold text-foreground/70'>
                Cash Received
              </label>
              <button
                type='button'
                onClick={() => setTendered(0)}
                className='text-xs font-bold text-destructive flex items-center gap-1 hover:opacity-80 transition-opacity'
              >
                <RotateCcw className='w-3 h-3' /> Reset
              </button>
            </div>
            <div className='relative'>
              <Wallet className='absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5' />
              <Input
                id='cash-input'
                type='number'
                className='h-16 pl-12 text-2xl font-black rounded-xl border-2 focus-visible:ring-primary bg-background'
                placeholder='0.00'
                autoFocus
                value={tendered === 0 ? '' : tendered / 100}
                onChange={e => setTendered(Number(e.target.value) * 100)}
              />
            </div>
          </div>

          {/* Quick Cash Buttons */}
          <div className='grid grid-cols-4 gap-2'>
            {[100, 200, 500, 1000].map(val => (
              <Button
                key={val}
                variant='outline'
                className='font-bold h-11 border-2 hover:bg-muted transition-colors'
                onClick={() => setTendered(prev => prev + val * 100)}
              >
                +{val}
              </Button>
            ))}
          </div>

          {/* Change/Balance Display: FIXED HEIGHT to prevent modal jump */}
          <div
            className={`h-20 flex items-center justify-between p-4 border-2 border-dashed rounded-2xl transition-all duration-300 ${
              canSubmit ? 'border-green-500/50 bg-green-500/5' : 'border-border bg-transparent'
            }`}
          >
            <div>
              <p className='text-[10px] font-black uppercase text-muted-foreground leading-none mb-1'>{change >= 0 ? 'Change to Return' : 'Balance Due'}</p>
              <p className={`text-2xl font-black transition-colors ${change >= 0 ? 'text-green-500' : 'text-muted-foreground/30'}`}>
                {PriceEngine.format(Math.abs(change))}
              </p>
            </div>
            {canSubmit && <CheckCircle2 className='w-8 h-8 text-green-500 animate-in zoom-in duration-300' />}
          </div>
        </div>

        <DialogFooter className='flex flex-col gap-3 sm:flex-col'>
          {/* Primary Action: Process the Payment */}
          <Button
            disabled={!canSubmit}
            onClick={handleFinalSubmit}
            className='w-full h-16 rounded-xl text-xl font-black shadow-xl transition-all active:scale-[0.98]'
            variant={canSubmit ? 'default' : 'secondary'}
          >
            CONFIRM PAYMENT
          </Button>

          {/* Secondary Action: Save for Later */}
          <Button
            type='button'
            variant='ghost'
            onClick={handlePayLater}
            className='w-full h-12 text-muted-foreground font-bold hover:text-foreground hover:bg-muted rounded-xl flex items-center justify-center gap-2'
          >
            Just place order, pay later
            <ArrowRight className='w-4 h-4' />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
