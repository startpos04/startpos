import { MoneyInput } from '@platform/components/custom/form/money-input'
import { SelectInput } from '@platform/components/custom/form/select-input'
import { TextInput } from '@platform/components/custom/form/text-input'
import { Button } from '@platform/components/ui/button'
import { Separator } from '@platform/components/ui/separator'
import { authStore } from '@platform/lib/better-auth/auth-store'
import dayjs from '@platform/lib/dayjs'
import { useForm, useStore } from '@tanstack/react-form'
import { ArrowLeft, CalendarDays, Hash, Package, ReceiptIndianRupee, Save, X } from 'lucide-react'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import type { MountProps } from '@platform/lib/mount-manager'
import type { feIngredient } from '@/lib/queries/fetch-ingredients'
import { fetchLocationOptions } from '@/lib/queries/fetch-location-options'
import { fetchSupplierOptions } from '@/lib/queries/fetch-supplier-options'
import { fetchUnitOptions } from '@/lib/queries/fetch-unit-options'
import { restockIngredient } from '@/lib/queries/restock-ingredient'
import { closeIngredientSidebar } from '../-components/ingredient-sidebar'

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

interface RestockIngredientSidebarProps extends MountProps {
  ingredient: feIngredient
  variant: feIngredient['variants'][number]
  onBack?: () => void
}

export function RestockIngredientSidebar({ open: _open, onClose, variant, ingredient, onBack }: RestockIngredientSidebarProps) {
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
    validators: { onChange: restockSchema },
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
        if (onBack) onBack()
        else if (onClose) onClose()
        else closeIngredientSidebar()
      } catch {
        toast.error('Restock failed. Check your connection or permissions.')
      }
    },
  })

  const handleClose = () => {
    if (onClose) onClose()
    else closeIngredientSidebar()
  }

  return (
    <div className='flex flex-col h-full'>
      {/* Header band */}
      <div className='flex items-center justify-between p-4 border-b shrink-0'>
        <div className='flex items-center gap-2'>
          {onBack && (
            <Button variant='ghost' size='icon' onClick={onBack} className='h-7 w-7'>
              <ArrowLeft className='size-4' />
            </Button>
          )}
          <div>
            <div className='flex items-center gap-2'>
              <Package className='h-4 w-4 text-emerald-500' />
              <h2 className='text-base font-semibold leading-none'>Restock Inventory</h2>
            </div>
            <p className='text-xs text-muted-foreground mt-1'>{[ingredient.name, variant?.name ? `(${variant.name})` : ''].filter(Boolean).join(' ')}</p>
          </div>
        </div>
        <Button variant='ghost' size='icon' onClick={handleClose} className='h-7 w-7'>
          <X className='size-4' />
        </Button>
      </div>

      {/* Scrollable form body */}
      <div className='flex-1 overflow-y-auto p-4 space-y-5'>
        {/* Section 1: Quantity & Cost */}
        <div className='space-y-3'>
          <h4 className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2'>
            <Hash className='w-3 h-3' /> Quantity & Cost
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
          <form.Field
            name='unitCost'
            children={field => (
              <MoneyInput
                field={field}
                label={`Unit Cost (${user.configs.CURRENCY})`}
                type='number'
                placeholder='0.00'
                className='rounded-xl font-mono'
                onChange={e => field.handleChange(Number(e.target.value))}
              />
            )}
          />
        </div>

        <Separator />

        {/* Section 2: Tracking */}
        <div className='space-y-3'>
          <h4 className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2'>
            <CalendarDays className='w-3 h-3' /> Tracking Details
          </h4>
          <form.Field
            name='batchNumber'
            children={field => <TextInput field={field} label='Batch / Lot Number' placeholder='Auto-generated' className='rounded-xl' />}
          />
          <form.Field name='expiryDate' children={field => <TextInput field={field} label='Expiry Date' type='date' className='rounded-xl' />} />
        </div>

        <Separator />

        {/* Section 3: Storage & Source */}
        <div className='space-y-3'>
          <h4 className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2'>
            <ReceiptIndianRupee className='w-3 h-3' /> Storage & Source
          </h4>
          <form.Field
            name='locationId'
            children={field => <SelectInput field={field} label='Location' options={locationOptions} placeholder='Select location' />}
          />
          <form.Field
            name='supplierId'
            children={field => <SelectInput field={field} label='Supplier' options={supplierOptions} placeholder='Select supplier' />}
          />
          <form.Field
            name='reason'
            children={field => <TextInput field={field} label='Reference / Note' placeholder='e.g. Supplier Invoice #123' className='rounded-xl' />}
          />
        </div>
      </div>

      {/* Sticky footer */}
      <div className='p-4 border-t shrink-0'>
        <form.Subscribe
          selector={state => [state.canSubmit, state.isSubmitting]}
          children={([canSubmit, isSubmitting]) => (
            <Button
              onClick={() => form.handleSubmit()}
              disabled={!canSubmit || isSubmitting}
              className='w-full h-11 rounded-xl font-semibold shadow-lg flex gap-2 shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]'
            >
              <Save className='w-4! h-4!' />
              {isSubmitting ? 'Updating Inventory...' : 'Complete Restock'}
            </Button>
          )}
        />
      </div>
    </div>
  )
}
