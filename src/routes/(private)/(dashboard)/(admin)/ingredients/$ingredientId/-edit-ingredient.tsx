import { toast } from 'sonner'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { productCollection, productVariantCollection } from '@/db/collections'
import type { OverlayProps } from '@/lib/overlay'
import { CreateIngredient, type CreateIngredientFormData } from '../create/-create-ingredients'

interface EditIngredientDialogProps extends OverlayProps {
  ingredientId: string
  defaultValues: CreateIngredientFormData
}

export function EditIngredientDialog({ ingredientId, defaultValues, open, onClose }: EditIngredientDialogProps) {
  const handleSubmit = async ({ value }: { value: CreateIngredientFormData }) => {
    const { sku, price, ...productData } = value

    // 1. Check if product exists
    const exists = productCollection.has(ingredientId)

    if (!exists) {
      throw new Error(`Product with ID ${ingredientId} not found`)
    }

    // 2. Update the main Product record
    const result = await productCollection.update(ingredientId, draft => {
      // Spread existing data and apply updates
      Object.assign(draft, {
        ...productData,
        image: productData.image || null,
      })
    })

    // 3. Handle the "updateMany" for Variants
    // In TanStack DB, we find the IDs first
    const variantIdsToUpdate = [...productVariantCollection.values()].filter(v => v.productId === ingredientId).map(v => v.id)

    if (variantIdsToUpdate.length > 0) {
      // Update all matching variants
      // Note: If your version of TanStack DB doesn't support a batch update callback,
      // you would loop through variantIdsToUpdate and call .update() on each.
      for (const vId of variantIdsToUpdate) {
        await productVariantCollection.update(vId, draft => {
          draft.sku = sku
          draft.price = price
          draft.costPrice = price
        })
      }
    }

    if (result.error) toast.error(result.error.message)
    else {
      toast.success('Ingredient successfully updated')
      onClose?.()
    }
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
