import { TaxCategory, VariantAttributeType } from 'prisma/generated/prisma/enums'
import { toast } from 'sonner'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { productCollection, productComponentCollection, productVariantCollection } from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
import type { OverlayProps } from '@/lib/overlay'
import { authStore } from '@/store/auth-store'
import { CreateProduct, type CreateProductFormData } from '../create/-create-product'

interface EditProductDialogProps extends OverlayProps {
  productId: string
  variantId?: string | undefined
  defaultValues: CreateProductFormData
}

export function EditProductDialog({ productId, variantId, defaultValues, open, onClose }: EditProductDialogProps) {
  const handleSubmit = async ({ value }: { value: CreateProductFormData }) => {
    const { user } = authStore.state
    const { sku, price, variants, ingredients, allowedAddons, ...productData } = value

    const result = await dbTransaction(() => {
      // 1. UPDATE PRODUCT
      productCollection.update(productId, draft => {
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
          productVariantCollection.update(variantId, draft => {
            draft.name = finalName
            draft.sku = finalSku
            draft.price = price
            draft.attributeType = isDefault ? VariantAttributeType.UNSPECIFIED : v.attributeType
            draft.updatedAt = new Date()
          })
        } else {
          productVariantCollection.insert({
            id: variantId,
            productId,
            name: finalName,
            sku: finalSku,
            price: price,
            costPrice: 0,
            image: null,
            attributeType: isDefault ? VariantAttributeType.UNSPECIFIED : v.attributeType,
            taxCategory: TaxCategory.STANDARD,
            lowStockThreshold: user.systemConfigs.LOW_STOCK_THRESHOLD,
            businessId: user.business.id,
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

        // 🛠️ CREATE A COMPOSITE HASH KEY: "materialId-isAddon"
        const getCompositeKey = (c: { materialId: string; isAddon: boolean }) => `${c.materialId}-${c.isAddon}`

        const incomingKeys = new Set(incomingComponents.map(getCompositeKey))

        // A. Identify components to DELETE using the safe composite key
        const idsToDelete = currentDbComponents.filter(dbComp => !incomingKeys.has(getCompositeKey(dbComp))).map(dbComp => dbComp.id)

        if (idsToDelete.length > 0) {
          productComponentCollection.delete(idsToDelete)
        }

        // B. Identify components to UPDATE or INSERT matching composite criteria
        for (const incoming of incomingComponents) {
          const incomingKey = getCompositeKey(incoming)

          // Look up explicitly using both conditions
          const existingRecord = currentDbComponents.find(dbComp => getCompositeKey(dbComp) === incomingKey)

          if (existingRecord) {
            // UPDATE: Sync properties if they changed
            productComponentCollection.update(existingRecord.id, draft => {
              draft.quantityUsed = incoming.quantityUsed
              draft.unitId = incoming.unitId
              draft.priceOverride = incoming.priceOverride
              draft.isAddon = incoming.isAddon // Safeguarded by composite match logic
              draft.updatedAt = new Date()
            })
          } else {
            // INSERT: Create new component record safely
            productComponentCollection.insert({
              id: crypto.randomUUID(),
              hostId: variantId,
              materialId: incoming.materialId,
              quantityUsed: incoming.quantityUsed,
              unitId: incoming.unitId,
              priceOverride: incoming.priceOverride,
              isAddon: incoming.isAddon,
              businessId: user.business.id,
              updatedAt: new Date(),
              createdAt: new Date(),
              deletedAt: null,
            })
          }
        }
      }
    })

    if (result.isErr()) {
      console.error('Transaction failed:', result.error.message)
      toast.error('Failed to update Product. Please try again.')
      return
    }

    toast.success('Product successfully updated')
    onClose?.()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-5xl h-[95vh]'>
        <CreateProduct
          variantId={variantId}
          defaultValues={defaultValues}
          onSubmit={handleSubmit}
          textBtn={{ default: 'Update Product', isSubmitting: 'Updating Product...' }}
        >
          <div>
            <h1 className='text-3xl font-bold tracking-tight'>Update Product</h1>
            <p className='text-muted-foreground text-sm'>Update product details, variants, and ingredients.</p>
          </div>
        </CreateProduct>
      </DialogContent>
    </Dialog>
  )
}
