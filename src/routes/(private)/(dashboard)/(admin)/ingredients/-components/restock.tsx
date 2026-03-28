import { SelectInput } from '@/components/custom/form/select-input'
import { TextInput } from '@/components/custom/form/text-input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fetchUnitOptions } from '@/lib/queries/fetch-unit-options'
import { restockIngredient } from '@/lib/server-fn/restock-ingredient'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { PackagePlus, Save } from 'lucide-react'
import { toast } from 'sonner'

export function RestockIngredientDialog({ open, onClose, ingredient }: any) {
  const queryClient = useQueryClient()
  const { data: unitOptions = [] } = fetchUnitOptions()

  const form = useForm({
    defaultValues: {
      productId: ingredient.id,
      quantity: 0,
      unitId: ingredient.baseUnitId,
      batchNumber: '',
      expiryDate: '',
      reason: '',
    },
    onSubmit: async ({ value }) => {
      try {
        await restockIngredient({ data: value })
        toast.success(`Inventory updated for ${ingredient.name}`)
        await queryClient.invalidateQueries({ queryKey: ['ingredients'] })
        onClose()
      } catch (error) {
        toast.error('Restock failed. Check your connection or permissions.')
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-md p-8'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-3 text-2xl font-bold'>
            <div className='bg-emerald-100 p-2 rounded-xl'>
              <PackagePlus className='w-6 h-6 text-emerald-600' />
            </div>
            Restock
          </DialogTitle>
          <p className='text-muted-foreground text-sm pl-1'>
            Adding stock for <span className='font-semibold text-foreground'>{ingredient.name}</span>
          </p>
        </DialogHeader>

        <div className='space-y-5 pt-4'>
          <div className='grid grid-cols-2 gap-4'>
            <form.Field
              name='quantity'
              children={field => <TextInput field={field} label='Quantity' type='number' onChange={e => field.handleChange(Number(e.target.value))} />}
            />
            <form.Field name='unitId' children={field => <SelectInput field={field} label='Unit' options={unitOptions} />} />
          </div>

          <div className='grid grid-cols-2 gap-4'>
            <form.Field name='batchNumber' children={field => <TextInput field={field} label='Batch #' placeholder='Optional' />} />
            <form.Field name='expiryDate' children={field => <TextInput field={field} label='Expiry' type='date' />} />
          </div>

          <form.Field name='reason' children={field => <TextInput field={field} label='Note' placeholder='e.g. Supplier XYZ' />} />

          <form.Subscribe
            selector={state => [state.canSubmit, state.isSubmitting]}
            children={([canSubmit, isSubmitting]) => (
              <Button onClick={() => form.handleSubmit()} disabled={!canSubmit} className='w-full'>
                <Save className='w-4 h-4 mr-2' />
                {isSubmitting ? 'Saving...' : 'Save Ingredient'}
              </Button>
            )}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
