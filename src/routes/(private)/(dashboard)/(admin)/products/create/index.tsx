import { Dialog, DialogContent } from '@/components/ui/dialog'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import { CreateProduct, CreateProductFormData } from './-create-product'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/products/create/')({
  component: () => <RouteComponent />,
})

export function CreateProductDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-5xl h-[95vh] p-0 overflow-hidden border-none shadow-2xl'>
        <RouteComponent onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

function RouteComponent({ onClose }: { onClose?: () => void }) {
  const queryClient = useQueryClient()

  const handleSubmit = async ({ value }: { value: CreateProductFormData }) => {
    const { ingredients, allowedAddons, sku: productSku, price: productPrice, ...productData } = value

    const result = await crudAPI.product('create', {
      data: {
        ...productData,
        type: productData.type as any,
        variants: {
          create: [
            {
              name: '',
              sku: productSku,
              price: productPrice,
              variantType: 'DEFAULT',
              components: {
                create: [
                  ...ingredients.map(ing => ({
                    materialId: ing.variant.id,
                    quantityUsed: ing.quantityUsed,
                    unitId: ing.unit.id,
                    isAddon: false,
                  })),
                  ...allowedAddons.map(item => ({
                    materialId: item.variant.id,
                    quantityUsed: item.defaultQuantity || 1,
                    unitId: item.unit.id,
                    isAddon: true,
                    priceOverride: item.priceOverride || null,
                  })),
                ],
              },
            },
          ],
        },
      },
    })

    result.match(
      async () => {
        await queryClient.invalidateQueries({ queryKey: ['products'] })
        toast.success('Product successfully created')
        onClose?.()
      },
      error => toast.error(error),
    )
  }

  return (
    <CreateProduct
      defaultValues={{
        name: '',
        sku: '',
        price: 0,
        type: 'BUNDLE',
        categoryId: '',
        baseUnitId: '',
        image: '',
        isAvailable: true,
        hasExpiry: false,
        ingredients: [],
        variants: [],
        allowedAddons: [],
      }}
      onSubmit={handleSubmit}
      textBtn={{ default: 'Add Product', isSubmitting: 'Adding Product...' }}
      children={
        <div>
          <h1 className='text-3xl font-bold'>New Product</h1>
          <p className='text-muted-foreground'> Define your product, variants, and recipe ingredients.</p>
        </div>
      }
    />
  )
}
