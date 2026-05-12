import type { Transaction } from '@tanstack/db'
import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { productCollection, productVariantCollection } from '@/db/collections'
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
    const { user } = authStore.state
    const { sku, price, ...productData } = value
    const results: Record<string, Transaction<Record<string, unknown>>> = {}

    try {
      const productId = crypto.randomUUID()
      results['products'] = await productCollection.insert({
        ...productData,
        id: productId,
        organizationId: user.organization.id,
        image: productData.image || null,
        requiresDeposit: false,
        depositAmount: 0,
        durationMinutes: null,
        updatedAt: new Date(),
        createdAt: new Date(),
        deletedAt: null,
      })
      await results['products'].isPersisted.promise

      results['productVariants'] = await productVariantCollection.insert({
        id: crypto.randomUUID(),
        organizationId: user.organization.id,
        productId,
        sku: sku,
        price: price,
        costPrice: price,
        name: '',
        image: null,
        variantType: 'DEFAULT',
        lowStockThreshold: user.branch.lowStockThreshold,
        updatedAt: new Date(),
        createdAt: new Date(),
        deletedAt: null,
      })
      await results['products'].isPersisted.promise

      toast.success('Ingredient successfully added')
      onClose?.()
    } catch (error) {
      await Promise.all(Object.values(results).map(r => r.rollback()))

      console.error('Transaction failed:', error)
      toast.error('Failed to add ingredient. Please try again.')
    }
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
