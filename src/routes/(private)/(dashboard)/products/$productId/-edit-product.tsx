import { ArrowLeft, X } from 'lucide-react'
import { TaxCategory, VariantAttributeType } from 'prisma/generated/prisma/enums'
import { toast } from 'sonner'
import { Button } from '@startpos-core/components/ui/button'
import { productCollection, productComponentCollection, productVariantCollection } from '@startpos-core/db/collections'
import { dbTransaction } from '@startpos-core/db/local-db-transaction'
import type { MountProps } from '@/lib/mount-manager'
import { authStore } from '@startpos-core/lib/better-auth/auth-store'
import { closeProductSidebar } from '../-components/product-sidebar'
import { CreateProduct, type CreateProductFormData } from '../create/-create-product'

interface EditProductSidebarProps extends MountProps {
  productId: string
  variantId?: string | undefined
  defaultValues: CreateProductFormData
  onBack?: () => void
}

export function EditProductSidebar({ productId, variantId, defaultValues, open: _open, onClose, onBack }: EditProductSidebarProps) {
  const handleSubmit = async ({ value }: { value: CreateProductFormData }) => {
    const { user } = authStore.state
    const { sku, price, costPrice, variants, ingredients, allowedAddons, isBatchPrepared, shelfLifeHours, ...productData } = value

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

      const variantsToProcess = variants.length === 0 ? [{ isDefault: true, id: value.variants?.[0]?.id, price, sku: '' }] : variants

      for (const v of variantsToProcess) {
        const isDefault = 'isDefault' in v
        const finalSku = isDefault ? sku : v.sku?.includes(sku) ? v.sku : `${sku}-${v.sku}`
        const finalName = isDefault ? productData.name : v.name || productData.name
        const resolvedVariantId = v.id && v.id !== 'new-variant' ? v.id : crypto.randomUUID()

        if (productVariantCollection.has(resolvedVariantId)) {
          productVariantCollection.update(resolvedVariantId, draft => {
            draft.name = finalName
            draft.sku = finalSku
            draft.price = price
            draft.costPrice = costPrice
            draft.attributeType = isDefault ? VariantAttributeType.UNSPECIFIED : v.attributeType
            draft.isBatchPrepared = isBatchPrepared
            draft.productionUsesRecipe = ingredients.length > 0 // Auto-detect from ingredients
            draft.shelfLifeHours = shelfLifeHours
            draft.updatedAt = new Date()
          })
        } else {
          productVariantCollection.insert({
            id: resolvedVariantId,
            productId,
            name: finalName,
            sku: finalSku,
            price: price,
            costPrice: costPrice,
            image: null,
            attributeType: isDefault ? VariantAttributeType.UNSPECIFIED : v.attributeType,
            taxCategory: TaxCategory.STANDARD,
            lowStockThreshold: user.configs.LOW_STOCK_THRESHOLD,
            isBatchPrepared,
            productionUsesRecipe: ingredients.length > 0, // Auto-detect from ingredients
            shelfLifeHours,
            businessId: user.business.id,
            updatedAt: new Date(),
            createdAt: new Date(),
            deletedAt: null,
          })
        }

        const currentDbComponents = [...productComponentCollection.values()].filter(c => c.hostId === resolvedVariantId)

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

        const getCompositeKey = (c: { materialId: string; isAddon: boolean }) => `${c.materialId}-${c.isAddon}`
        const incomingKeys = new Set(incomingComponents.map(getCompositeKey))
        const idsToDelete = currentDbComponents.filter(dbComp => !incomingKeys.has(getCompositeKey(dbComp))).map(dbComp => dbComp.id)

        if (idsToDelete.length > 0) productComponentCollection.delete(idsToDelete)

        for (const incoming of incomingComponents) {
          const existingRecord = currentDbComponents.find(dbComp => getCompositeKey(dbComp) === getCompositeKey(incoming))
          if (existingRecord) {
            productComponentCollection.update(existingRecord.id, draft => {
              draft.quantityUsed = incoming.quantityUsed
              draft.unitId = incoming.unitId
              draft.priceOverride = incoming.priceOverride
              draft.isAddon = incoming.isAddon
              draft.updatedAt = new Date()
            })
          } else {
            productComponentCollection.insert({
              id: crypto.randomUUID(),
              hostId: resolvedVariantId,
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
    if (onBack) onBack()
    else if (onClose) onClose()
    else closeProductSidebar()
  }

  const handleClose = () => {
    if (onClose) onClose()
    else closeProductSidebar()
  }

  return (
    <div className='flex flex-col h-full'>
      {/* Header band */}
      <div className='flex items-center justify-between p-4 border-b shrink-0'>
        <div className='flex items-center gap-2'>
          {onBack && (
            <Button variant='ghost' size='icon' onClick={onBack} className='h-7 w-7'>
              <ArrowLeft className='size-4' />
            </Button>
          )}
          <div>
            <h2 className='text-base font-semibold leading-none'>Update Product</h2>
            <p className='text-xs text-muted-foreground mt-1'>Update details, variants, and ingredients.</p>
          </div>
        </div>
        <Button variant='ghost' size='icon' onClick={handleClose} className='h-7 w-7'>
          <X className='size-4' />
        </Button>
      </div>

      {/* Form — flex-1 min-h-0 lets it fill remaining height inside flex-col */}
      <div className='flex-1 min-h-0'>
        <CreateProduct
          variantId={variantId}
          defaultValues={defaultValues}
          onSubmit={handleSubmit}
          textBtn={{ default: 'Update Product', isSubmitting: 'Updating...' }}
        />
      </div>
    </div>
  )
}
