import { MoneyInput } from '@/components/custom/form/money-input'
import { SelectInput } from '@/components/custom/form/select-input'
import { TextInput } from '@/components/custom/form/text-input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import dayjs from '@/lib/dayjs'
import { OverlayProps } from '@/lib/overlay'
import { fetchUnitOptions } from '@/lib/queries/fetch-unit-options'
import { restockIngredient } from '@/lib/server-fn/restock-ingredient'
import { authStore } from '@/store/auth-store'
import { useForm, useStore } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Hash, ReceiptIndianRupee, Save } from 'lucide-react'
import { useMemo } from 'react'
import { toast } from 'sonner'

interface RestockIngredientDialogProps extends OverlayProps {
  ingredient: any
  variant: any
}

export function RestockIngredientDialog({ open, onClose, ingredient, variant }: RestockIngredientDialogProps) {
  const queryClient = useQueryClient()
  const user = useStore(authStore, state => state.user)
  const { data: unitOptions = [] } = fetchUnitOptions()

  // 2. Generate a default batch number (e.g., BN-20231027-A1B2)
  const defaultBatchNumber = useMemo(() => {
    const datePart = dayjs().format('YYYYMMDD')
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase()
    return `BN-${datePart}-${randomPart}`
  }, [open]) // Re-generates only when the dialog is re-opened

  const form = useForm({
    defaultValues: {
      variantId: variant.id,
      quantity: 0,
      unitId: variant.product?.baseUnitId || '',
      unitCost: Number(variant.costPrice || 0),
      batchNumber: defaultBatchNumber,
      expiryDate: '',
      location: '',
      sourceName: '',
      reason: 'Manual Restock',
    },
    onSubmit: async ({ value }) => {
      if (value.quantity <= 0) {
        toast.error('Please enter a valid quantity')
        return
      }
      try {
        await restockIngredient({ data: value })
        toast.success(`Inventory updated for ${variant.name || variant.product?.name}`)

        // Invalidate specific keys for your POS/Inventory tables
        await queryClient.invalidateQueries({ queryKey: ['ingredient', ingredient.id] })
        await queryClient.invalidateQueries({ queryKey: ['ingredients'] })

        onClose()
      } catch (error) {
        toast.error('Restock failed. Check your connection or permissions.')
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-lg p-4 space-y-6 overflow-hidden border-none shadow-2xl bg-background gap-0'>
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
                    label={`Unit Cost (${user.branch.currency || 'PHP'})`}
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
              name='location'
              children={field => <TextInput field={field} label='Storage Location' placeholder='Aisle 1 / Fridge' className='rounded-xl' />}
            />
            <form.Field
              name='sourceName'
              children={field => <TextInput field={field} label='Supplier Name' placeholder='Wholesale Mart' className='rounded-xl' />}
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
