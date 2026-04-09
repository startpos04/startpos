import { Dialog, DialogContent } from '@/components/ui/dialog'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CreateIngredient, CreateIngredientFormData } from '../create/-create-ingredients'

export function EditIngredientDialog({
  ingredientId,
  defaultValues,
  open,
  onClose,
}: {
  ingredientId: string
  defaultValues: CreateIngredientFormData
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()

  const handleSubmit = async ({ value }: { value: CreateIngredientFormData }) => {
    const { sku, price, ...productData } = value

    const result = await crudAPI.product('update', {
      where: { id: ingredientId },
      data: {
        ...productData,
        image: productData.image || null,
        // 2. Perform a nested update on the variants
        variants: {
          updateMany: {
            where: { productId: ingredientId },
            data: {
              sku: sku,
              price: price,
              costPrice: price,
            },
          },
        },
      },
    })

    result.match(
      async () => {
        await queryClient.invalidateQueries({ queryKey: ['ingredients'] })
        await queryClient.invalidateQueries({ queryKey: ['ingredient', ingredientId] })
        toast.success('Ingredient successfully updated')
        onClose?.()
      },
      error => {
        if (error.includes('Unique constraint') && error.includes('sku')) {
          toast.error('The SKU is already in use by another product.')
        } else {
          toast.error(error)
        }
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-3xl max-h-[90vh] overflow-y-auto'>
        <CreateIngredient
          defaultValues={defaultValues}
          onSubmit={handleSubmit}
          textBtn={{ default: 'Update Ingredient', isSubmitting: 'Updating Ingredient...' }}
          children={
            <div>
              <h1 className='text-3xl font-bold tracking-tight'>Update Ingredient</h1>
              <p className='text-muted-foreground text-sm'>Modify the properties, SKU, and unit costs for this raw material.</p>
            </div>
          }
        />
      </DialogContent>
    </Dialog>
  )
}
