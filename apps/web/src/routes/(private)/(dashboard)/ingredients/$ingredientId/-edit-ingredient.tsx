import { Button } from '@platform/components/ui/button'
import { productCollection, productVariantCollection } from '@platform/db/collections'
import { dbTransaction } from '@platform/db/local-db-transaction'
import { ArrowLeft, X } from 'lucide-react'
import { toast } from 'sonner'
import type { MountProps } from '@platform/lib/mount-manager'
import { closeIngredientSidebar } from '../-components/ingredient-sidebar'
import { CreateIngredient, type CreateIngredientFormData } from '../create/-create-ingredients'

interface EditIngredientSidebarProps extends MountProps {
  ingredientId: string
  defaultValues: CreateIngredientFormData
  onBack?: () => void
}

export function EditIngredientSidebar({ ingredientId, defaultValues, open: _open, onClose, onBack }: EditIngredientSidebarProps) {
  const handleSubmit = async ({ value }: { value: CreateIngredientFormData }) => {
    const { sku, price, ...productData } = value

    const exists = productCollection.has(ingredientId)
    if (!exists) {
      throw new Error(`Product with ID ${ingredientId} not found`)
    }

    const result = await dbTransaction(() => {
      productCollection.update(ingredientId, draft => {
        Object.assign(draft, {
          ...productData,
          image: productData.image || null,
        })
      })

      const variantIdsToUpdate = [...productVariantCollection.values()].filter(v => v.productId === ingredientId).map(v => v.id)

      if (variantIdsToUpdate.length > 0) {
        for (const vId of variantIdsToUpdate) {
          productVariantCollection.update(vId, draft => {
            draft.sku = sku
            draft.price = price
            draft.costPrice = price
          })
        }
      }
    })

    if (result.isErr()) {
      console.error('Transaction failed:', result.error.message)
      toast.error('Failed to update ingredient. Please try again.')
      return
    }

    toast.success('Ingredient successfully updated')
    if (onBack) onBack()
    else if (onClose) onClose()
    else closeIngredientSidebar()
  }

  const handleClose = () => {
    if (onClose) onClose()
    else closeIngredientSidebar()
  }

  return (
    <div className='flex flex-col h-full'>
      {/* Header band with back button */}
      <div className='flex items-center justify-between p-4 border-b shrink-0'>
        <div className='flex items-center gap-2'>
          {onBack && (
            <Button variant='ghost' size='icon' onClick={onBack} className='h-7 w-7'>
              <ArrowLeft className='size-4' />
            </Button>
          )}
          <div>
            <h2 className='text-base font-semibold leading-none'>Update Ingredient</h2>
            <p className='text-xs text-muted-foreground mt-1'>Modify properties, SKU, and unit costs.</p>
          </div>
        </div>
        <Button variant='ghost' size='icon' onClick={handleClose} className='h-7 w-7'>
          <X className='size-4' />
        </Button>
      </div>

      {/* Form content (CreateIngredient already has flex-col h-full with scrollable body + footer) */}
      <CreateIngredient defaultValues={defaultValues} onSubmit={handleSubmit} textBtn={{ default: 'Update Ingredient', isSubmitting: 'Updating...' }} />
    </div>
  )
}
