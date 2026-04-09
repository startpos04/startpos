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
    if (value.variants.length === 0) {
      value.variants = [
        {
          id: '',
          name: '',
          sku: value.sku,
          price: value.price,
          variantType: 'DEFAULT',
        },
      ]
    }

    const { variants, ingredients, allowedAddons, sku, price, ...productData } = value

    const result = await crudAPI.product('create', {
      data: {
        ...productData, // This now excludes sku and price
        type: productData.type as any,
        allowedAddons: {
          create: allowedAddons.map(item => ({
            addonId: item.addon.id,
            priceOverride: item.priceOverride,
            defaultQuantity: item.defaultQuantity,
            unitId: item.unit.id,
          })),
        },
        variants: {
          create: variants.map(v => ({
            name: v.name,
            sku: `${sku}-${v.sku}`,
            price: v.price,
            costPrice: 0,
            variantType: v.variantType,
            ingredients: {
              create: ingredients.map(ing => ({
                materialId: ing.variant.id,
                quantityUsed: ing.quantityUsed,
                unitId: ing.unit.id,
              })),
            },
          })),
        },
      },
    })

    result.match(
      async () => {
        await queryClient.invalidateQueries({ queryKey: ['products'] })
        toast.success('Product and Variants successfully created')
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
