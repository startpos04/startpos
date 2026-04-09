import { Dialog, DialogContent } from '@/components/ui/dialog'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import { CreateIngredient, CreateIngredientFormData } from './-create-ingredients'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/ingredients/create/')({
  component: () => <RouteComponent />,
})

export function CreateIngredientDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-3xl'>
        <RouteComponent onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

function RouteComponent({ onClose }: { onClose?: () => void }) {
  const queryClient = useQueryClient()

  const handleSubmit = async ({ value }: { value: CreateIngredientFormData }) => {
    const { sku, price, ...productData } = value

    const result = await crudAPI.product('create', {
      data: {
        ...productData,
        image: productData.image || null,
        variants: {
          create: [
            {
              sku: sku,
              price: price,
              name: '',
              variantType: 'DEFAULT',
            },
          ],
        },
      },
    })

    result.match(
      async () => {
        await queryClient.invalidateQueries({ queryKey: ['ingredients'] })
        toast.success('Ingredient successfully added')
        onClose?.()
      },
      error => toast.error(error),
    )
  }

  return (
    <CreateIngredient
      defaultValues={{
        name: '',
        sku: '',
        image: '',
        type: 'RAW_MATERIAL' as const,
        categoryId: '',
        baseUnitId: '',
        price: 0,
        isAvailable: false,
        hasExpiry: true,
      }}
      onSubmit={handleSubmit}
      textBtn={{ default: 'Add Ingredient', isSubmitting: 'Adding Ingredient...' }}
      children={
        <div>
          <h1 className='text-3xl font-bold'>New Ingredient</h1>
          <p className='text-muted-foreground'>Register a new raw material and define its tracking units.</p>
        </div>
      }
    />
  )
}
