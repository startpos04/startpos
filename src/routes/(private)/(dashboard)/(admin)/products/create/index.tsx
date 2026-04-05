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
      <DialogContent className='sm:max-w-5xl h-[95vh]'>
        <RouteComponent onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

function RouteComponent({ onClose }: { onClose?: () => void }) {
  const queryClient = useQueryClient()

  const handleSubmit = async ({ value }: { value: CreateProductFormData }) => {
    const { variants, ingredients, allowedAddons, ...product } = value

    const result = await crudAPI.product('create', {
      data: {
        ...product,
        type: product.type as any,
        ingredients: {
          createMany: {
            data: ingredients.map(ingredient => ({
              materialId: ingredient.material.id,
              quantityUsed: ingredient.quantityUsed,
              unitId: ingredient.unit.id,
            })),
          },
        },
        allowedAddons: {
          createMany: {
            data: allowedAddons.map(addon => ({ addonId: addon.addon.id, priceOverride: addon.priceOverride, defaultQuantity: addon.defaultQuantity })),
          },
        },
        variants: {
          createMany: {
            data: variants.map(variant => ({
              ...product,
              type: product.type as any,
              variantType: variant.variantType,
              variantValue: variant.variantValue,
              sku: `${product.sku}-${variant.sku}`,
              price: variant.price,
            })),
          },
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
          <p className='text-muted-foreground'>Register a new raw material and define its tracking units.</p>
        </div>
      }
    />
  )
}
