import { useForm, useStore } from '@tanstack/react-form'
import { Minus, Plus, Save, ShoppingCart, X } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Form } from '@/components/custom/form'
import { MoneyInput } from '@/components/custom/form/money-input'
import { SelectInput } from '@/components/custom/form/select-input'
import { TextInput } from '@/components/custom/form/text-input'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { PriceEngine } from '@/lib/conversion/price-engine'
import { createPurchase } from '@/lib/queries/create-purchase'
import { fetchSupplierOptions } from '@/lib/queries/fetch-supplier-options'
import { fetchUnitOptions } from '@/lib/queries/fetch-unit-options'
import { fetchVariantOptions } from '@/lib/queries/fetch-variant-options'
import { closePurchaseSidebar } from '../-components/purchase-sidebar'

const lineItemSchema = z.object({
  variantId: z.string().min(1, 'Item required'),
  quantity: z.number().positive('Must be > 0'),
  unitId: z.string().min(1, 'Unit required'),
  unitCost: z.number().nonnegative('Cost must be ≥ 0'),
})

const createPurchaseFormSchema = z.object({
  supplierId: z.string().min(1, 'Supplier required'),
  notes: z.string(),
  items: z.array(lineItemSchema).min(1, 'Add at least one item'),
})

type CreatePurchaseFormData = z.infer<typeof createPurchaseFormSchema>

interface CreatePurchaseSidebarProps {
  onClose?: () => void
}

export function CreatePurchaseSidebar({ onClose }: CreatePurchaseSidebarProps) {
  const { data: supplierOptions = [] } = fetchSupplierOptions()
  const { data: unitOptions = [] } = fetchUnitOptions()
  const { data: variantOptions = [] } = fetchVariantOptions()

  const handleClose = () => {
    if (onClose) onClose()
    else closePurchaseSidebar()
  }

  const form = useForm({
    defaultValues: {
      supplierId: '',
      notes: '',
      items: [{ variantId: '', quantity: 0, unitId: '', unitCost: 0 }],
    } as CreatePurchaseFormData,
    validators: { onChange: createPurchaseFormSchema },
    onSubmit: async ({ value }) => {
      const { data, error } = await createPurchase({
        supplierId: value.supplierId,
        notes: value.notes || null,
        items: value.items,
      })

      if (error || !data) {
        toast.error('Failed to create purchase')
        return
      }

      toast.success(`Purchase ${data.structuredId} created and inventory updated`)
      handleClose()
    },
  })

  const lineItems = useStore(form.store, s => s.values.items)
  const totalCost = lineItems.reduce((sum, i) => sum + Math.round((i.unitCost || 0) * (i.quantity || 0)), 0)

  return (
    <div className='flex flex-col h-full'>
      {/* Header */}
      <div className='flex items-center justify-between p-4 border-b shrink-0'>
        <div className='flex items-center gap-2'>
          <ShoppingCart className='h-4 w-4 text-primary' />
          <div>
            <h2 className='text-base font-semibold leading-none'>New Purchase</h2>
            <p className='text-xs text-muted-foreground mt-1'>Record supplier delivery & update stock</p>
          </div>
        </div>
        <Button variant='ghost' size='icon' onClick={handleClose} className='h-7 w-7'>
          <X className='size-4' />
        </Button>
      </div>

      <Form onSubmit={form.handleSubmit} className='flex flex-col flex-1 min-h-0'>
        <div className='flex-1 overflow-y-auto p-4 space-y-5'>
          {/* Supplier & Notes */}
          <div className='space-y-3'>
            <h4 className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>Purchase Details</h4>
            <form.Field
              name='supplierId'
              children={field => <SelectInput field={field} label='Supplier' options={supplierOptions} placeholder='Select supplier' />}
            />
            <form.Field name='notes' children={field => <TextInput field={field} label='Reference / Invoice # (optional)' placeholder='e.g. INV-2025-001' />} />
          </div>

          <Separator />

          {/* Line Items */}
          <div className='space-y-3'>
            <div className='flex items-center justify-between'>
              <h4 className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>Line Items</h4>
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='rounded-full'
                onClick={() => form.pushFieldValue('items', { variantId: '', quantity: 0, unitId: '', unitCost: 0 })}
              >
                <Plus className='size-3.5 mr-1' /> Add Item
              </Button>
            </div>

            <form.Subscribe
              selector={s => s.values.items}
              children={items => (
                <div className='space-y-3'>
                  {items.map((_, idx) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: fix later
                    <div key={idx} className='p-3 rounded-xl border border-border/50 bg-muted/20 space-y-2'>
                      <div className='flex items-center justify-between'>
                        <span className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>Item {idx + 1}</span>
                        {items.length > 1 && (
                          <Button
                            type='button'
                            variant='ghost'
                            size='icon'
                            className='h-6 w-6 text-destructive/70'
                            onClick={() =>
                              // biome-ignore lint/suspicious/noExplicitAny: array filter on form state
                              form.setFieldValue('items', (prev: any[]) => prev.filter((_, i) => i !== idx))
                            }
                          >
                            <Minus className='size-3' />
                          </Button>
                        )}
                      </div>
                      <form.Field
                        name={`items[${idx}].variantId`}
                        children={field => <SelectInput field={field} label='Product / Variant' options={variantOptions} placeholder='Search product...' />}
                      />
                      <div className='grid grid-cols-3 gap-2'>
                        <form.Field
                          name={`items[${idx}].quantity`}
                          children={field => <TextInput field={field} label='Qty' type='number' onChange={e => field.handleChange(Number(e.target.value))} />}
                        />
                        <form.Field name={`items[${idx}].unitId`} children={field => <SelectInput field={field} label='Unit' options={unitOptions} />} />
                        <form.Field name={`items[${idx}].unitCost`} children={field => <MoneyInput field={field} label='Unit Cost' />} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            />
          </div>

          {/* Total */}
          <div className='flex items-center justify-between px-1 py-2 rounded-xl bg-primary/5 border border-primary/20'>
            <span className='text-sm font-bold'>Total Cost</span>
            <span className='text-lg font-black font-mono text-primary'>{PriceEngine.format(totalCost)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className='p-4 border-t shrink-0'>
          <form.Subscribe
            selector={s => [s.canSubmit, s.isSubmitting]}
            children={([canSubmit, isSubmitting]) => (
              <Button
                type='submit'
                disabled={!canSubmit || isSubmitting}
                className='w-full h-11 rounded-xl font-semibold flex gap-2 shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]'
              >
                <Save className='size-4' />
                {isSubmitting ? 'Saving...' : 'Create Purchase & Update Stock'}
              </Button>
            )}
          />
        </div>
      </Form>
    </div>
  )
}
