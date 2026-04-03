import { Dialog, DialogContent } from '@/components/ui/dialog'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQueryClient } from '@tanstack/react-query'
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
    try {
      await crudAPI({
        data: {
          table: 'product',
          action: 'update',
          args: {
            where: { id: ingredientId },
            data: {
              ...value,
              image: value.image || null,
            },
          },
        },
      })

      await queryClient.invalidateQueries({ queryKey: ['ingredients'] })
      await queryClient.invalidateQueries({ queryKey: ['ingredient', ingredientId] })
      onClose?.()
    } catch (error) {
      console.error('Failed to create ingredient:', error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-4xl max-h-[90vh] overflow-y-auto'>
        <CreateIngredient
          defaultValues={defaultValues}
          onSubmit={handleSubmit}
          textBtn={{ default: 'Update Ingredient', isSubmitting: 'Updating Ingredient...' }}
          children={
            <div>
              <h1 className='text-3xl font-bold tracking-tight'>Update Ingredient</h1>
              <p className='text-muted-foreground text-sm'>Update staff account and its permissions.</p>
            </div>
          }
        />
      </DialogContent>
    </Dialog>
  )
}
