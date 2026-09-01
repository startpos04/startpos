import { createFileRoute } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { TaxCategory, VariantAttributeType } from 'prisma/generated/prisma/enums'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { productCollection, productVariantCollection } from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
import { authStore } from '@/lib/better-auth/auth-store'
import { closeIngredientSidebar } from '../-components/ingredient-sidebar'
import { CreateIngredient, type CreateIngredientFormData } from './-create-ingredients'

export const Route = createFileRoute('/(private)/(dashboard)/ingredients/create/')({
  component: () => <CreateIngredientSidebar />,
})

interface CreateIngredientSidebarProps {
  onClose?: () => void
}

export function CreateIngredientSidebar({ onClose }: CreateIngredientSidebarProps) {
  const handleClose = onClose ?? closeIngredientSidebar

  const handleSubmit = async ({ value }: { value: CreateIngredientFormData }) => {
    const { sku, price, ...productData } = value
    const { user } = authStore.state

    const result = await dbTransaction(() => {
      const productId = crypto.randomUUID()
      productCollection.insert({
        ...productData,
        id: productId,
        businessId: user.business.id,
        image: productData.image || null,
        requiresDeposit: false,
        depositAmount: 0,
        durationMinutes: null,
        updatedAt: new Date(),
        createdAt: new Date(),
        deletedAt: null,
      })

      productVariantCollection.insert({
        id: crypto.randomUUID(),
        businessId: user.business.id,
        productId,
        sku: sku,
        price: price,
        costPrice: price,
        name: '',
        image: null,
        attributeType: VariantAttributeType.UNSPECIFIED,
        taxCategory: TaxCategory.STANDARD,
        lowStockThreshold: user.configs.LOW_STOCK_THRESHOLD,
        updatedAt: new Date(),
        createdAt: new Date(),
        deletedAt: null,
      })
    })

    if (result.isErr()) {
      console.error('Transaction failed:', result.error.message)
      toast.error('Failed to add ingredient. Please try again.')
      return
    }

    toast.success('Ingredient successfully added')
    handleClose()
  }

  return (
    <CreateIngredient
      defaultValues={{
        name: '',
        sku: '',
        image: '',
        type: 'RAW_MATERIAL' as const,
        categoryId: '',
        baseUnitId: '',
        price: 0,
        isAvailable: false,
        hasExpiry: true,
      }}
      onSubmit={handleSubmit}
      textBtn={{ default: 'Add Ingredient', isSubmitting: 'Adding Ingredient...' }}
    >
      <div className='flex items-start justify-between gap-2'>
        <div>
          <h2 className='text-xl font-semibold'>New Ingredient</h2>
          <p className='text-muted-foreground text-sm'>Register a new raw material and define its tracking units.</p>
        </div>
        <Button type='button' variant='ghost' size='icon' onClick={handleClose} className='shrink-0 mt-0.5'>
          <X />
        </Button>
      </div>
    </CreateIngredient>
  )
}
