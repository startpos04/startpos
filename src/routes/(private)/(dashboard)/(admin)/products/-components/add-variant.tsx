import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Info, Layers, Plus, Trash2 } from 'lucide-react'
import * as React from 'react'

interface OptionRow {
  id: string
  value: string
  sku: string
  price: number
}

export function AddVariantModal({ open, onClose, onAdd, parentName, parentSku }: any) {
  const [variantType, setVariantType] = React.useState('Size')
  const [options, setOptions] = React.useState<OptionRow[]>([{ id: crypto.randomUUID(), value: '', sku: '', price: 0 }])

  const addRow = () => {
    setOptions([...options, { id: crypto.randomUUID(), value: '', sku: '', price: 0 }])
  }

  const removeRow = (id: string) => {
    if (options.length > 1) {
      setOptions(options.filter(opt => opt.id !== id))
    }
  }

  const updateRow = (id: string, field: keyof OptionRow, val: any) => {
    setOptions(options.map(opt => (opt.id === id ? { ...opt, [field]: val } : opt)))
  }

  const handleAdd = () => {
    const validOptions = options.filter(opt => opt.value.trim() !== '')

    // Map to your schema's product structure
    const generatedVariants = validOptions.map(opt => ({
      name: `${parentName} (${opt.value})`,
      sku: opt.sku || `${parentSku || 'SKU'}-${opt.value.toUpperCase().substring(0, 3)}`,
      price: opt.price,
    }))

    onAdd(generatedVariants)
    onClose()
    // Reset state
    setVariantType('Size')
    setOptions([{ id: crypto.randomUUID(), value: '', sku: '', price: 0 }])
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-4xl max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Layers className='w-5 h-5 text-amber-500' /> New Variations
          </DialogTitle>
        </DialogHeader>

        <div className='space-y-4 py-4'>
          <div className='bg-amber-500/5 p-3 rounded-md border border-amber-500/10 flex gap-2'>
            <Info className='w-4 h-4 text-amber-500 shrink-0 mt-0.5' />
            <p className='text-[10px] text-amber-700 leading-tight'>
              Define a type (e.g. Size) and add multiple options. This will create individual linked products for{' '}
              <strong>{parentName || 'this product'}</strong>.
            </p>
          </div>

          {/* Variant Type Input */}
          <div className='space-y-2'>
            <Label className='text-xs'>Variant Type</Label>
            <Input placeholder='e.g. Size, Color, Volume' value={variantType} onChange={e => setVariantType(e.target.value)} />
          </div>

          <div className='space-y-3'>
            <div className='flex justify-between items-center'>
              <Label className='text-[10px] font-bold uppercase text-muted-foreground tracking-wider'>Options</Label>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={addRow}
                className='h-7 text-[10px] border-amber-500/20 text-amber-600 hover:bg-amber-50'
              >
                <Plus className='w-3 h-3 mr-1' /> Add Option
              </Button>
            </div>

            <div className='space-y-2 max-h-60 overflow-y-auto pr-1'>
              {options.map(opt => (
                <div key={opt.id} className='grid grid-cols-12 gap-2 items-end'>
                  <div className='col-span-4 space-y-1'>
                    <Label className='text-[10px]'>Option Value</Label>
                    <Input placeholder='e.g. Small' value={opt.value} onChange={e => updateRow(opt.id, 'value', e.target.value)} />
                  </div>
                  <div className='col-span-4 space-y-1'>
                    <Label className='text-[10px]'>Specific SKU</Label>
                    <Input placeholder='V-SKU' value={opt.sku} onChange={e => updateRow(opt.id, 'sku', e.target.value)} />
                  </div>
                  <div className='col-span-3 space-y-1'>
                    <Label className='text-[10px]'>Price</Label>
                    <Input type='number' value={opt.price} onChange={e => updateRow(opt.id, 'price', Number(e.target.value))} />
                  </div>
                  <div className='col-span-1 pb-1'>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='h-9 w-9 text-muted-foreground hover:text-destructive'
                      onClick={() => removeRow(opt.id)}
                      disabled={options.length === 1}
                    >
                      <Trash2 className='w-4 h-4' />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant='ghost' onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!options.some(o => o.value.trim() !== '')}
            onClick={handleAdd}
            className='bg-amber-600 hover:bg-amber-700 shadow-lg shadow-amber-500/20 px-6'
          >
            Create {options.filter(o => o.value !== '').length} Variants
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
