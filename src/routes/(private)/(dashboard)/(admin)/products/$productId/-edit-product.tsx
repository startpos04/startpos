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

    const result = await crudAPI.product('update', {
      where: { id: productId },
      data: {
        ...product,
        type: value.type as ResourceType,
        image: value.image || null,
        ingredients: {
          upsert: ingredients.map(ing => ({
            where: { id: ing.id },
            update: {
              quantityUsed: ing.quantityUsed,
              unitId: ing.unit.id,
            },
            create: {
              materialId: ing.material.id,
              quantityUsed: ing.quantityUsed,
              unitId: ing.unit.id,
            },
          })),
        },
        allowedAddons: {
          upsert: allowedAddons.map(addon => ({
            where: { id: addon.id },
            update: {
              priceOverride: addon.priceOverride,
              defaultQuantity: addon.defaultQuantity,
            },
            create: {
              addonId: addon.addon.id,
              priceOverride: addon.priceOverride,
              defaultQuantity: addon.defaultQuantity,
            },
          })),
        },
        variants: {
          upsert: variants.map(variant => ({
            where: { id: variant.id },
            update: {
              sku: variant.sku,
              price: variant.price,
              variantType: variant.variantType,
              variantValue: variant.variantValue,
            },
            create: {
              ...product,
              type: product.type as any,
              variantType: variant.variantType,
              variantValue: variant.variantValue,
              sku: `${product.sku}-${variant.sku}`,
              price: variant.price,
            },
          })),
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
