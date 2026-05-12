import type { Transaction } from '@tanstack/db'
import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { productCollection, productComponentCollection, productVariantCollection } from '@/db/collections'
import type { OverlayProps } from '@/lib/overlay'
import { authStore } from '@/store/auth-store'
import { CreateProduct, type CreateProductFormData } from './-create-product'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/products/create/')({
  component: () => <RouteComponent />,
})

export function CreateProductDialog({ open, onClose }: OverlayProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-5xl h-[95vh] p-0 overflow-hidden border-none shadow-2xl'>
        <RouteComponent onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

function RouteComponent({ onClose }: { onClose?: () => void }) {
  const handleSubmit = async ({ value }: { value: CreateProductFormData }) => {
    const { ingredients, allowedAddons, sku: productSku, price: productPrice, variants, ...productData } = value
    const { user } = authStore.state
    const results: Record<string, Transaction<Record<string, unknown>>> = {}

    try {
      // 1. Create the Main Product
      const productId = crypto.randomUUID()
      results['products'] = await productCollection.insert({
        ...productData,
        id: productId,
        type: productData.type,
        requiresDeposit: false,
        depositAmount: null,
        durationMinutes: null,
        organizationId: user.organization.id,
        updatedAt: new Date(),
        createdAt: new Date(),
        deletedAt: null,
      })
      await results['products'].isPersisted.promise

      // 2. Create the Default Variant
      const variantId = crypto.randomUUID()
      results['productVariants'] = await productVariantCollection.insert({
        id: variantId,
        productId: productId,
        name: 'Default',
        sku: productSku,
        price: productPrice,
        variantType: 'DEFAULT',
        image: null,
        costPrice: productPrice,
        lowStockThreshold: user.branch.lowStockThreshold,
        organizationId: user.organization.id,
        updatedAt: new Date(),
        createdAt: new Date(),
        deletedAt: null,
      })
      await results['productVariants'].isPersisted.promise

      // 3. Prepare Components (Ingredients + Addons)
      const componentsToInsert = [
        ...ingredients.map(ing => ({
          id: crypto.randomUUID(),
          hostId: variantId,
          materialId: ing.variant.id,
          quantityUsed: ing.quantityUsed,
          unitId: ing.unit.id,
          isAddon: false,
          priceOverride: null,
          organizationId: user.organization.id,
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
          organizationId: user.organization.id,
          updatedAt: new Date(),
          createdAt: new Date(),
          deletedAt: null,
        })),
      ]

      // 4. Batch Insert Components
      if (componentsToInsert.length > 0) {
        results['productComponents'] = await productComponentCollection.insert(componentsToInsert)
        await results['productComponents'].isPersisted.promise
      }

      toast.success('Product successfully created')
      onClose?.()
    } catch (error) {
      await Promise.all(Object.values(results).map(r => r.rollback()))

      console.error('Transaction failed:', error)
      toast.error('Failed to add Product. Please try again.')
    }
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
