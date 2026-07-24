import { createFileRoute } from '@tanstack/react-router'
import { TaxCategory, VariantAttributeType } from 'prisma/generated/prisma/enums'
import { toast } from 'sonner'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { productCollection, productVariantCollection } from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
import { authStore } from '@/store/auth-store'
import { CreateIngredient, type CreateIngredientFormData } from './-create-ingredients'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/ingredients/create/')({
  component: () => <RouteComponent />,
})

export function CreateIngredientDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-3xl'>
        <RouteComponent onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

function RouteComponent({ onClose }: { onClose?: () => void }) {
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
        lowStockThreshold: user.systemConfigs.LOW_STOCK_THRESHOLD,
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
    onClose?.()
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
      children={
        <div>
          <h1 className='text-3xl font-bold'>New Ingredient</h1>
          <p className='text-muted-foreground'>Register a new raw material and define its tracking units.</p>
        </div>
      }
    />
  )
}
