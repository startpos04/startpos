import type { Transaction } from '@tanstack/db'
import { toast } from 'sonner'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { productCollection, productComponentCollection, productVariantCollection } from '@/db/collections'
import type { OverlayProps } from '@/lib/overlay'
import { authStore } from '@/store/auth-store'
import { CreateProduct, type CreateProductFormData } from '../create/-create-product'

interface EditProductDialogProps extends OverlayProps {
  productId: string
  defaultValues: CreateProductFormData
}

export function EditProductDialog({ productId, defaultValues, open, onClose }: EditProductDialogProps) {
  const handleSubmit = async ({ value }: { value: CreateProductFormData }) => {
    const { sku, price, variants, ingredients, allowedAddons, ...productData } = value
    const { user } = authStore.state
    const results: Record<string, Transaction<Record<string, unknown>>> = {}

    try {
      // 1. UPDATE PRODUCT
      await productCollection.update(productId, draft => {
        Object.assign(draft, {
          ...productData,
          type: value.type,
          image: value.image || null,
          updatedAt: new Date(),
        })
      })

      // Prepare the variant list
      const variantsToProcess = variants.length === 0 ? [{ isDefault: true, id: value.variants?.[0]?.id, price, sku: '' }] : variants

      for (const v of variantsToProcess) {
        const isDefault = 'isDefault' in v
        const finalSku = isDefault ? sku : v.sku?.includes(sku) ? v.sku : `${sku}-${v.sku}`
        const finalName = isDefault ? productData.name : v.name || productData.name
        const variantId = v.id && v.id !== 'new-variant' ? v.id : crypto.randomUUID()

        // 2. UPSERT VARIANT
        if (productVariantCollection.has(variantId)) {
          await productVariantCollection.update(variantId, draft => {
            draft.name = finalName
            draft.sku = finalSku
            draft.price = price
            draft.variantType = isDefault ? 'DEFAULT' : v.variantType
            draft.updatedAt = new Date()
          })
        } else {
          await productVariantCollection.insert({
            id: variantId,
            productId,
            name: finalName,
            sku: finalSku,
            price: price,
            costPrice: 0,
            image: null,
            lowStockThreshold: user.branch.lowStockThreshold,
            variantType: isDefault ? 'DEFAULT' : v.variantType,
            organizationId: user.organization.id,
            updatedAt: new Date(),
            createdAt: new Date(),
            deletedAt: null,
          })
        }

        // 3. SYNC COMPONENTS (Upsert Logic)

        // Get all existing components currently in DB for this variant
        const currentDbComponents = [...productComponentCollection.values()].filter(c => c.hostId === variantId)

        // Map the form data (ingredients + addons) into a unified structure
        const incomingComponents = [
          ...ingredients.map(ing => ({
            materialId: ing.variant.id,
            quantityUsed: ing.quantityUsed,
            unitId: ing.unit.id,
            priceOverride: null,
            isAddon: false,
          })),
          ...allowedAddons.map(addon => ({
            materialId: addon.variant.id,
            quantityUsed: addon.defaultQuantity || 1,
            unitId: addon.unit.id,
            priceOverride: addon.priceOverride,
            isAddon: true,
          })),
        ]

        // A. Identify components to DELETE (In DB, but not in the incoming list)
        const incomingMaterialIds = new Set(incomingComponents.map(c => c.materialId))
        const idsToDelete = currentDbComponents.filter(dbComp => !incomingMaterialIds.has(dbComp.materialId)).map(dbComp => dbComp.id)

        if (idsToDelete.length > 0) {
          await productComponentCollection.delete(idsToDelete)
        }

        // B. Identify components to UPDATE or INSERT
        for (const incoming of incomingComponents) {
          const existingRecord = currentDbComponents.find(dbComp => dbComp.materialId === incoming.materialId)

          if (existingRecord) {
            // UPDATE: Sync properties if they changed
            await productComponentCollection.update(existingRecord.id, draft => {
              draft.quantityUsed = incoming.quantityUsed
              draft.unitId = incoming.unitId
              draft.priceOverride = incoming.priceOverride
              draft.isAddon = incoming.isAddon
              draft.updatedAt = new Date()
            })
          } else {
            // INSERT: Create new component record
            await productComponentCollection.insert({
              id: crypto.randomUUID(),
              hostId: variantId,
              materialId: incoming.materialId,
              quantityUsed: incoming.quantityUsed,
              unitId: incoming.unitId,
              priceOverride: incoming.priceOverride,
              isAddon: incoming.isAddon,
              organizationId: user.organization.id,
              updatedAt: new Date(),
              createdAt: new Date(),
              deletedAt: null,
            })
          }
        }
      }

      toast.success('Product successfully updated')
      onClose?.()
    } catch (error) {
      await Promise.all(Object.values(results).map(r => r.rollback()))

      console.error('Transaction failed:', error)
      toast.error('Failed to update Product. Please try again.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-5xl h-[95vh]'>
        <CreateProduct defaultValues={defaultValues} onSubmit={handleSubmit} textBtn={{ default: 'Update Product', isSubmitting: 'Updating Product...' }}>
          <div>
            <h1 className='text-3xl font-bold tracking-tight'>Update Product</h1>
            <p className='text-muted-foreground text-sm'>Update product details, variants, and ingredients.</p>
          </div>
        </CreateProduct>
      </DialogContent>
    </Dialog>
  )
}
