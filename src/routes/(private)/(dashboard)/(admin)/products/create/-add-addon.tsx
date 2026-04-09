import Form from '@/components/custom/form'
import { MoneyInput } from '@/components/custom/form/money-input'
import { SelectInput } from '@/components/custom/form/select-input'
import { TextInput } from '@/components/custom/form/text-input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { showModal } from '@/lib/overlay'
import { feIngredient, fetchIngredients } from '@/lib/queries/fetch-ingredients'
import { fetchUnitOptions } from '@/lib/queries/fetch-unit-options'
import { cn } from '@/lib/utils'
import { useForm, useStore } from '@tanstack/react-form'
import { Check, PlusCircle, Scale, Search } from 'lucide-react'
import { Unit } from 'prisma/generated/prisma/browser'
import * as React from 'react'
import z from 'zod'
import { CreateIngredientDialog } from '../../ingredients/create'

interface AddAddonModalProps {
  open: boolean
  onClose: () => void
  onAdd: (addon: { product: feIngredient; variant: feIngredient['variants'][number]; defaultQuantity: number; priceOverride: number; unit: Unit }) => void
}

// 2. Schema with coercion for the quantity
const addonSchema = z.object({
  selectedVariantId: z.string().min(1, 'Please select an addon'),
  selectedVariant: z.custom<feIngredient['variants'][number]>().nullable(),
  selectedUnitId: z.string().min(1, 'Select a unit'),
  defaultQuantity: z.number().gt(0, 'Must be greater than 0'),
  priceOverride: z.number().min(0, 'Price cannot be negative'),
})

export function AddAddonModal({ open, onClose, onAdd }: AddAddonModalProps) {
  const { data = [] } = fetchIngredients()
  const [search, setSearch] = React.useState('')
  const { data: unitOptions = [] } = fetchUnitOptions()

  const form = useForm({
    defaultValues: {
      selectedVariantId: '',
      selectedVariant: null as feIngredient['variants'][number] | null,
      selectedUnitId: '',
      defaultQuantity: 1,
      priceOverride: 0,
    },
    validators: {
      onChange: addonSchema,
    },
    onSubmit: async ({ value }) => {
      const unit = unitOptions.find(o => o.value === value.selectedUnitId)?.data
      const parentProduct = data.find(p => p.variants.some(v => v.id === value.selectedVariantId))

      if (value.selectedVariant && unit && parentProduct) {
        onAdd({
          product: parentProduct,
          variant: value.selectedVariant,
          defaultQuantity: value.defaultQuantity,
          priceOverride: value.priceOverride,
          unit,
        })
        form.reset()
        onClose()
      }
    },
  })

  // Filter products by name
  const filtered = data.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
  const selectedVariant = useStore(form.store, state => state.values.selectedVariant)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-md border-none shadow-2xl rounded-[2rem]'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <PlusCircle className='w-5 h-5 text-blue-500' /> Add Optional Extra
          </DialogTitle>
        </DialogHeader>

        <Form onSubmit={form.handleSubmit} className='grid gap-4'>
          <div className='flex gap-2'>
            <div className='relative flex items-center grow'>
              <Search className='absolute left-2 h-4 w-4 text-muted-foreground' />
              <Input placeholder='Search addons...' value={search} onChange={e => setSearch(e.target.value)} className='pl-7 rounded-xl' />
            </div>
            <Button type='button' variant='outline' className='rounded-xl' onClick={() => showModal(CreateIngredientDialog)}>
              Create
            </Button>
          </div>

          <form.Field name='selectedVariantId'>
            {idField => (
              <form.Field name='selectedVariant'>
                {objField => (
                  <form.Field name='selectedUnitId'>
                    {unitField => (
                      <ScrollArea className='h-64 pr-3'>
                        <div className='space-y-1'>
                          {filtered.map(product => (
                            <div key={product.id} className='mb-2'>
                              {product.variants.map(variant => (
                                <div
                                  key={variant.id}
                                  onClick={() => {
                                    idField.handleChange(variant.id)
                                    objField.handleChange(variant)
                                    unitField.handleChange(product.baseUnitId)
                                  }}
                                  className={cn(
                                    'flex items-center justify-between p-2 rounded-xl cursor-pointer border transition-all mb-1',
                                    idField.state.value === variant.id ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/50',
                                  )}
                                >
                                  <div className='flex gap-3 items-center'>
                                    <Avatar className='h-8 w-8 rounded-lg'>
                                      <AvatarImage src={product.image ?? ''} />
                                      <AvatarFallback>{product.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div className='flex flex-col'>
                                      <span className='text-sm font-semibold'>
                                        {[product.name, variant?.name ? `(${variant?.name})` : ''].filter(Boolean).join(' ')}
                                      </span>
                                      <div className='flex items-center gap-2'>
                                        <Badge variant='secondary' className='text-[9px] h-3.5 px-1 uppercase tracking-tighter font-mono'>
                                          {variant.sku}
                                        </Badge>
                                      </div>
                                    </div>
                                  </div>
                                  {idField.state.value === variant.id && <Check className='h-4 w-4 text-primary mr-2' />}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </form.Field>
                )}
              </form.Field>
            )}
          </form.Field>

          <div className='bg-secondary/20 p-4 rounded-[1.5rem] border border-border/50 space-y-3'>
            <div className='flex justify-between items-center'>
              <Label className='text-[10px] font-black uppercase tracking-widest text-muted-foreground'>Requirement</Label>
              {selectedVariant && (
                <div className='flex items-center gap-1 text-emerald-600 font-bold text-[10px] uppercase'>
                  <Scale className='w-3 h-3' />
                  Stock Unit: {selectedVariant?.product.baseUnit.abbreviation}
                </div>
              )}
            </div>

            <div className='flex gap-2'>
              <form.Field
                name='defaultQuantity'
                children={field => <TextInput field={field} label='Qty' type='number' step='0.0001' className='grow' disabled={!selectedVariant} />}
              />
              <form.Field
                name='selectedUnitId'
                children={field => <SelectInput field={field} label='Unit' options={unitOptions} disabled={!selectedVariant} />}
              />
            </div>

            {/* Price Override Field */}
            <form.Field name='priceOverride' children={field => <MoneyInput field={field} label='Price' disabled={!selectedVariant} />} />

            <p className='text-[10px] text-muted-foreground italic leading-tight mt-1 text-center'>
              Define the default amount and customer price for this add-on.
            </p>
          </div>

          <DialogFooter className='gap-2 sm:gap-0'>
            <Button type='button' variant='ghost' onClick={onClose} className='rounded-xl'>
              Cancel
            </Button>
            <form.Subscribe selector={state => [state.canSubmit, state.values.selectedVariantId]}>
              {([canSubmit, currentId]) => (
                <Button type='submit' disabled={!canSubmit || !currentId} className='rounded-xl px-8 shadow-lg shadow-primary/20'>
                  Link Add-on
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
