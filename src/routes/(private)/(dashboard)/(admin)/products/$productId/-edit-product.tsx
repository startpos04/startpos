import { Dialog, DialogContent } from '@/components/ui/dialog'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQueryClient } from '@tanstack/react-query'
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
    const { sku, price, variants, ingredients, allowedAddons, ...productData } = value

    const result = await crudAPI.product('update', {
      where: { id: productId },
      data: {
        ...productData, // No sku or price here
        type: value.type as any,
        image: value.image || null,

        // 1. Update Addons (Product Level)
        allowedAddons: {
          upsert: allowedAddons.map(addon => ({
            where: { id: addon.id || 'new-addon' }, // Ensure ID is valid or placeholder
            update: {
              priceOverride: addon.priceOverride,
              defaultQuantity: addon.defaultQuantity,
            },
            create: {
              addonId: addon.addon.id,
              priceOverride: addon.priceOverride,
              defaultQuantity: addon.defaultQuantity,
              unitId: addon.unit.id,
            },
          })),
        },

        // 2. Update Variants (and their nested Ingredients)
        variants: {
          upsert: (variants.length === 0 ? [{ isDefault: true, id: value.variants?.[0]?.id, price, sku: '' }] : variants).map(v => {
            const isDefault = 'isDefault' in v
            const finalSku = isDefault ? sku : v.sku?.includes(sku) ? v.sku : `${sku}-${v.sku}`
            const finalName = isDefault ? productData.name : v.name || productData.name

            return {
              where: { id: v.id || 'new-variant' },
              update: {
                name: finalName,
                sku: finalSku,
                price: v.price,
                variantType: isDefault ? 'DEFAULT' : v.variantType,
                ingredients: {
                  deleteMany: {}, // Simplest way to "update" ingredients is to replace them
                  create: ingredients.map(ing => ({
                    materialId: ing.variant.id,
                    quantityUsed: ing.quantityUsed,
                    unitId: ing.unit.id,
                  })),
                },
              },
              create: {
                name: finalName,
                sku: finalSku,
                price: v.price,
                costPrice: 0,
                variantType: isDefault ? 'DEFAULT' : v.variantType,
                ingredients: {
                  create: ingredients.map(ing => ({
                    materialId: ing.variant.id,
                    quantityUsed: ing.quantityUsed,
                    unitId: ing.unit.id,
                  })),
                },
              },
            }
          }),
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
