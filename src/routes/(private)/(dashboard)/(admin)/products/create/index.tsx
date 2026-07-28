import { createFileRoute } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { TaxCategory, VariantAttributeType } from 'prisma/generated/prisma/enums'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { productCollection, productComponentCollection, productVariantCollection } from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
import { authStore } from '@/store/auth-store'
import { closeProductSidebar } from '../-components/product-sidebar'
import { CreateProduct, type CreateProductFormData } from './-create-product'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/products/create/')({
  component: () => <CreateProductSidebar />,
})

interface CreateProductSidebarProps {
  onClose?: () => void
}

export function CreateProductSidebar({ onClose }: CreateProductSidebarProps) {
  const handleClose = onClose ?? closeProductSidebar

  const handleSubmit = async ({ value }: { value: CreateProductFormData }) => {
    const { ingredients, allowedAddons, sku: productSku, price: productPrice, variants, ...productData } = value
    const { user } = authStore.state

    const result = await dbTransaction(() => {
      const productId = crypto.randomUUID()
      productCollection.insert({
        ...productData,
        id: productId,
        type: productData.type,
        requiresDeposit: false,
        depositAmount: null,
        durationMinutes: null,
        businessId: user.business.id,
        updatedAt: new Date(),
        createdAt: new Date(),
        deletedAt: null,
      })

      const variantId = crypto.randomUUID()
      productVariantCollection.insert({
        id: variantId,
        productId: productId,
        name: 'Default',
        sku: productSku,
        price: productPrice,
        image: null,
        costPrice: productPrice,
        attributeType: VariantAttributeType.UNSPECIFIED,
        taxCategory: TaxCategory.STANDARD,
        lowStockThreshold: Number(user.systemConfigs.LOW_STOCK_THRESHOLD),
        businessId: user.business.id,
        updatedAt: new Date(),
        createdAt: new Date(),
        deletedAt: null,
      })

      const componentsToInsert = [
        ...ingredients.map(ing => ({
          id: crypto.randomUUID(),
          hostId: variantId,
          materialId: ing.variant.id,
          quantityUsed: ing.quantityUsed,
          unitId: ing.unit.id,
          isAddon: false,
          priceOverride: null,
          businessId: user.business.id,
          updatedAt: new Date(),
          createdAt: new Date(),
          deletedAt: null,
        })),
        ...allowedAddons.map(item => ({
          id: crypto.randomUUID(),
          hostId: variantId,
          materialId: item.variant.id,
          quantityUsed: item.defaultQuantity || 1,
          unitId: item.unit.id,
          isAddon: true,
          priceOverride: item.priceOverride || null,
          businessId: user.business.id,
          updatedAt: new Date(),
          createdAt: new Date(),
          deletedAt: null,
        })),
      ]

      if (componentsToInsert.length > 0) {
        productComponentCollection.insert(componentsToInsert)
      }
    })

    if (result.isErr()) {
      console.error('Transaction failed:', result.error.message)
      toast.error('Failed to add Product. Please try again.')
      return
    }

    toast.success('Product successfully created')
    handleClose()
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
    >
      <div className='flex items-start justify-between gap-2'>
        <div>
          <h2 className='text-xl font-semibold'>New Product</h2>
          <p className='text-muted-foreground text-sm'>Define your product, variants, and recipe ingredients.</p>
        </div>
        <Button type='button' variant='ghost' size='icon' onClick={handleClose} className='shrink-0 mt-0.5'>
          <X />
        </Button>
      </div>
    </CreateProduct>
  )
}
