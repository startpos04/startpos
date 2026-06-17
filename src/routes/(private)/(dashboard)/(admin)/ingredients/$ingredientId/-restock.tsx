import { useForm, useStore } from '@tanstack/react-form'
import { CalendarDays, Hash, ReceiptIndianRupee, Save } from 'lucide-react'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { MoneyInput } from '@/components/custom/form/money-input'
import { SelectInput } from '@/components/custom/form/select-input'
import { TextInput } from '@/components/custom/form/text-input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import dayjs from '@/lib/dayjs'
import type { OverlayProps } from '@/lib/overlay'
import type { feIngredient } from '@/lib/queries/fetch-ingredients'
import { fetchLocationOptions } from '@/lib/queries/fetch-location-options'
import { fetchSupplierOptions } from '@/lib/queries/fetch-supplier-options'
import { fetchUnitOptions } from '@/lib/queries/fetch-unit-options'
import { restockIngredient } from '@/lib/queries/restock-ingredient'
import { authStore } from '@/store/auth-store'

const restockSchema = z.object({
  variantId: z.string().min(1, 'Variant ID is required'),
  quantity: z.number().positive('Quantity must be greater than 0'),
  unitId: z.string().min(1, 'Unit is required'),
  unitCost: z.number().nonnegative('Unit cost cannot be negative'),
  batchNumber: z.string().min(1, 'Batch number is required'),
  expiryDate: z.string(),
  supplierId: z.string().min(1, 'Supplier is required'),
  locationId: z.string().min(1, 'Location is required'),
  reason: z.string().min(1, 'Reason/Note is required'),
})

interface RestockIngredientDialogProps extends OverlayProps {
  ingredient: feIngredient
  variant: feIngredient['variants'][number]
}

export function RestockIngredientDialog({ open, onClose, variant }: RestockIngredientDialogProps) {
  const user = useStore(authStore, state => state.user)
  const { data: unitOptions = [] } = fetchUnitOptions()
  const { data: locationOptions = [] } = fetchLocationOptions()
  const { data: supplierOptions = [] } = fetchSupplierOptions()

  const defaultBatchNumber = useMemo(() => {
    const datePart = dayjs().format('YYYYMMDD')
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase()
    return `BN-${datePart}-${randomPart}`
  }, [])

  const form = useForm({
    validators: {
      onChange: restockSchema,
    },
    defaultValues: {
      variantId: variant.id,
      quantity: 0,
      unitId: variant.product?.baseUnitId || '',
      unitCost: Number(variant.costPrice || 0),
      batchNumber: defaultBatchNumber,
      expiryDate: '',
      supplierId: '',
      locationId: '',
      reason: 'Manual Restock',
    },
    onSubmit: async ({ value }) => {
      try {
        await restockIngredient(value)
        toast.success(`Inventory updated for ${variant.name || variant.product?.name}`)
        onClose?.()
      } catch {
        toast.error('Restock failed. Check your connection or permissions.')
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className='sm:max-w-lg p-4 space-y-6 overflow-hidden border-none shadow-2xl bg-background gap-0'
        onEscapeKeyDown={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className='text-3xl font-bold tracking-tight'>Restock Inventory</DialogTitle>
          <DialogDescription className='text-emerald-100 text-base'>
            Recording new stock for{' '}
            <span className='font-bold text-white'>{[variant.product.name, variant?.name ? `(${variant.name})` : ''].filter(Boolean).join(' ')}</span>
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-6'>
          {/* Section 1: Quantity & Cost */}
          <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
            <div className='space-y-4'>
              <h4 className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2'>
                <Hash className='w-3 h-3' /> Quantity Info
              </h4>
              <div className='grid grid-cols-2 gap-3'>
                <form.Field
                  name='quantity'
                  children={field => (
                    <TextInput field={field} label='Qty' type='number' className='rounded-xl' onChange={e => field.handleChange(Number(e.target.value))} />
                  )}
                />
                <form.Field name='unitId' children={field => <SelectInput field={field} label='Unit' options={unitOptions} />} />
              </div>
            </div>

            <div className='space-y-4'>
              <h4 className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2'>
                <ReceiptIndianRupee className='w-3 h-3' /> Financials
              </h4>
              <form.Field
                name='unitCost'
                children={field => (
                  <MoneyInput
                    field={field}
                    label={`Unit Cost (${user.systemConfigs.CURRENCY})`}
                    type='number'
                    placeholder='0.00'
                    className='rounded-xl font-mono'
                    onChange={e => field.handleChange(Number(e.target.value))}
                  />
                )}
              />
            </div>
          </div>

          <Separator className='bg-border/50' />

          {/* Section 2: Batch & Expiry */}
          <div className='space-y-4'>
            <h4 className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2'>
              <CalendarDays className='w-3 h-3' /> Tracking Details
            </h4>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <form.Field
                name='batchNumber'
                children={field => <TextInput field={field} label='Batch/Lot Number' placeholder='Optional' className='rounded-xl' />}
              />
              <form.Field name='expiryDate' children={field => <TextInput field={field} label='Expiry Date' type='date' className='rounded-xl' />} />
            </div>
          </div>

          {/* Section 3: Storage & Source */}
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <form.Field
              name='locationId'
              children={field => <SelectInput field={field} label='Location' options={locationOptions} placeholder='Select location' />}
            />
            <form.Field
              name='supplierId'
              children={field => <SelectInput field={field} label='Supplier' options={supplierOptions} placeholder='Select supplier' />}
            />
          </div>

          <form.Field
            name='reason'
            children={field => <TextInput field={field} label='Reference / Note' placeholder='e.g. Supplier Invoice #123' className='rounded-xl' />}
          />

          <div className='pt-4'>
            <form.Subscribe
              selector={state => [state.canSubmit, state.isSubmitting]}
              children={([canSubmit, isSubmitting]) => (
                <Button
                  onClick={() => form.handleSubmit()}
                  disabled={!canSubmit || isSubmitting}
                  className='w-full h-14 rounded-2xl text-lg font-bold shadow-xl active:scale-95 flex gap-2 shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]'
                >
                  <Save className='w-5! h-5!' />
                  {isSubmitting ? 'Updating Inventory...' : 'Complete Restock'}
                </Button>
              )}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
