import { Dialog, DialogContent } from '@/components/ui/dialog'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQueryClient } from '@tanstack/react-query'
import { ResourceType } from 'prisma/generated/prisma/enums'
import { toast } from 'sonner'
import { CreateProduct, CreateProductFormData } from '../create/-create-product'

export function EditProductDialog({
  productId,
  defaultValues,
  open,
  onClose,
}: {
  productId: string
  defaultValues: CreateProductFormData
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()

  const handleSubmit = async ({ value }: { value: CreateProductFormData }) => {
    const { variants, ingredients, allowedAddons, ...product } = value

    const result = await crudAPI({
      data: {
        table: 'product',
        action: 'update',
        args: {
          where: { id: productId },
          data: {
            ...product,
            type: value.type as ResourceType,
            image: value.image || null,
            ingredients: {
              update: ingredients.map(ing => ({
                where: { id: ing.id },
                data: {
                  quantityUsed: ing.quantityUsed,
                  unitId: ing.unit.id,
                },
              })),
            },
            allowedAddons: {
              update: allowedAddons.map(addon => ({
                where: { id: addon.id },
                data: {
                  priceOverride: addon.priceOverride,
                  defaultQuantity: addon.defaultQuantity,
                },
              })),
            },
            variants: {
              update: variants.map(variant => ({
                where: { id: variant.id },
                data: {
                  sku: variant.sku,
                  price: variant.price,
                  variantType: variant.variantType,
                  variantValue: variant.variantValue,
                },
              })),
            },
          },
        },
      },
    })

    result.match(
      async () => {
        await queryClient.invalidateQueries({ queryKey: ['products'] })
        await queryClient.invalidateQueries({ queryKey: ['product', productId] })
        toast.success('Product successfully updated')
        onClose?.()
      },
      error => toast.error(error),
    )
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-5xl h-[95vh]'>
        <CreateProduct
          defaultValues={defaultValues}
          onSubmit={handleSubmit}
          textBtn={{ default: 'Update Product', isSubmitting: 'Updating Product...' }}
          children={
            <div>
              <h1 className='text-3xl font-bold tracking-tight'>Update Product</h1>
              <p className='text-muted-foreground text-sm'>Update staff account and its permissions.</p>
            </div>
          }
        />
      </DialogContent>
    </Dialog>
  )
}
