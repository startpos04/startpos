import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Info, Layers } from 'lucide-react'
import * as React from 'react'

export function AddVariantModal({ open, onClose, onAdd, parentName }: any) {
  const [name, setName] = React.useState('')
  const [sku, setSku] = React.useState('')
  const [price, setPrice] = React.useState(0)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-106.25  border-none shadow-2xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Layers className='w-5 h-5 text-amber-500' /> New Variation
          </DialogTitle>
        </DialogHeader>

        <div className='space-y-4 py-4'>
          <div className='bg-amber-500/5 p-3 rounded-md border border-amber-500/10 flex gap-2'>
            <Info className='w-4 h-4 text-amber-500 shrink-0 mt-0.5' />
            <p className='text-[10px] text-amber-700 leading-tight'>
              This will create a sub-item linked to <strong>{parentName || 'this product'}</strong>. Useful for different sizes or colors.
            </p>
          </div>

          <div className='space-y-2'>
            <Label>Variant Name</Label>
            <Input placeholder='e.g. Large, Red, 500ml' value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div className='grid grid-cols-2 gap-4'>
            <div className='space-y-2'>
              <Label>Specific SKU</Label>
              <Input placeholder='V-001' value={sku} onChange={e => setSku(e.target.value)} />
            </div>
            <div className='space-y-2'>
              <Label>Price</Label>
              <Input type='number' value={price} onChange={e => setPrice(Number(e.target.value))} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant='ghost' onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!name}
            onClick={() => {
              onAdd({ name, sku, price })
              onClose()
              setName('')
              setSku('')
              setPrice(0)
            }}
            className='bg-amber-600 hover:bg-amber-700 shadow-lg shadow-amber-500/20'
          >
            Create Variant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
