import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PriceEngine } from '@/lib/conversion/price-engine'
import { CheckCircle2, RotateCcw, Wallet } from 'lucide-react'
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
      <DialogContent className='sm:max-w-[425px] p-6 md:p-8 overflow-hidden'>
        <DialogHeader>
          <DialogTitle className='text-2xl font-black text-center'>Finalize Payment</DialogTitle>
        </DialogHeader>

        <div className='py-4 space-y-6'>
          {/* Total Display - Adaptable Background */}
          <div className='text-center p-5 bg-muted/50 rounded-2xl border border-border'>
            <p className='text-xs text-muted-foreground font-bold uppercase tracking-widest'>Total Amount Due</p>
            <p className='text-4xl font-black text-foreground'>{PriceEngine.format(total)}</p>
          </div>

          {/* Input Section */}
          <div className='space-y-2'>
            <div className='flex justify-between items-end px-1'>
              <label className='text-sm font-bold text-foreground/70'>Cash Received</label>
              <button onClick={() => setTendered(0)} className='text-xs font-bold text-destructive flex items-center gap-1 hover:opacity-80 transition-opacity'>
                <RotateCcw className='w-3 h-3' /> Reset
              </button>
            </div>
            <div className='relative'>
              <Wallet className='absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5' />
              <Input
                type='number'
                className='h-16 pl-12 text-2xl font-black rounded-xl border-2 focus-visible:ring-primary'
                placeholder='0.00'
                autoFocus
                value={tendered === 0 ? '' : tendered / 100}
                onChange={e => setTendered(Number(e.target.value) * 100)}
              />
            </div>
          </div>

          {/* Quick Denominations */}
          <div className='grid grid-cols-4 gap-2'>
            {[100, 200, 500, 1000].map(val => (
              <Button key={val} variant='outline' className='font-bold h-11 border-2' onClick={() => setTendered(prev => prev + val * 100)}>
                +{val}
              </Button>
            ))}
          </div>

          {/* FIXED HEIGHT FOOTER: Stops height jumping */}
          <div
            className={`h-[80px] flex items-center justify-between p-4 border-2 border-dashed rounded-2xl transition-all duration-300 ${
              canSubmit ? 'border-green-500/50 bg-green-500/5' : 'border-border bg-transparent'
            }`}
          >
            <div>
              <p className='text-[10px] font-black uppercase text-muted-foreground leading-none mb-1'>
                {change >= 0 ? 'Change to Return' : 'Remaining Balance'}
              </p>
              <p className={`text-2xl font-black transition-colors ${change >= 0 ? 'text-green-500' : 'text-muted-foreground/50'}`}>
                {PriceEngine.format(Math.abs(change))}
              </p>
            </div>
            {canSubmit && <CheckCircle2 className='w-8 h-8 text-green-500 animate-in zoom-in duration-300' />}
          </div>
        </div>

        <DialogFooter>
          <Button
            disabled={!canSubmit}
            onClick={handleFinalSubmit}
            className='w-full h-16 rounded-xl text-xl font-black shadow-xl'
            variant={canSubmit ? 'default' : 'secondary'}
          >
            Complete Transaction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
