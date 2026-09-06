/**
 * quick-add-dialog.tsx
 *
 * QuickAddDialog — lightweight "sell now, catalog later" modal for the POS.
 *
 * The cashier types a product name and price. On confirm the product is
 * created as a provisional record (SERVICE type, no inventory tracking) and
 * the resulting posItem is handed directly to handleAddToCart — the item
 * appears in the cart immediately without any page navigation.
 *
 * Architecture:
 *   - Follows the same MountProps pattern as ProductDialog.
 *   - Uses dbTransaction → productCollection + productVariantCollection to
 *     create the product locally-first (syncs to server in background).
 *   - Resolves a default category and unit for the business on the fly;
 *     creates them if they don't exist yet (first Quick Add bootstraps defaults).
 *   - The created product is isProvisional = true so it shows in the
 *     "Products needing review" queue on the Products page.
 */

import { Form } from '@platform/components/custom/form'
import { MoneyInput } from '@platform/components/custom/form/money-input'
import { TextInput } from '@platform/components/custom/form/text-input'
import { Button } from '@platform/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@platform/components/ui/dialog'
import { categoryCollection, productCollection, productVariantCollection, unitCollection } from '@platform/db/collections'
import { dbTransaction } from '@platform/db/local-db-transaction'
import type { MountProps } from '@platform/lib/mount-manager'
import { useForm, uuid } from '@tanstack/react-form'
import { PackagePlus, X } from 'lucide-react'
import { ResourceType, TaxCategory, VariantAttributeType } from 'prisma/generated/prisma/browser'
import { toast } from 'sonner'
import { z } from 'zod'
import { useAuthenticatedUser } from '@/lib/better-auth/auth-store'
import type { posItem } from '@/lib/conversion/pos-stock-engine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuickAddDialogProps extends MountProps {
  /** Pre-filled from the search term — empty string for the no-catalog state */
  searchQuery: string
  /** Optional SKU to pre-fill (e.g., from barcode scan) */
  sku?: string
  onConfirm: (item: posItem) => void
}

// ---------------------------------------------------------------------------
// Default catalog lookup
// Finds the "General" category and "pcs" unit seeded at registration.
// Both are guaranteed to exist — complete-registration.ts creates them in
// Step 9. Returns null if somehow not found (shouldn't happen in practice).
// ---------------------------------------------------------------------------

interface QuickAddDefaults {
  categoryId: string
  unitId: string
  unitName: string
}

function resolveDefaults(businessId: string): QuickAddDefaults | null {
  const category = [...categoryCollection.values()].find(c => c.businessId === businessId && c.name === 'General')
  const unit = [...unitCollection.values()].find(u => u.businessId === businessId && u.abbreviation === 'pcs')

  if (!category || !unit) return null

  return {
    categoryId: category.id,
    unitId: unit.id,
    unitName: unit.name,
  }
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const schema = z.object({
  name: z.string().min(1, 'Product name is required'),
  sku: z.string().optional(),
  price: z.number().min(1, 'Price must be greater than 0'),
})

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuickAddDialog({ open, onClose, searchQuery, sku, onConfirm }: QuickAddDialogProps) {
  const user = useAuthenticatedUser()

  const form = useForm({
    defaultValues: {
      name: searchQuery.trim(),
      sku: sku?.trim() || '',
      price: 0,
    },
    validators: {
      onChange: schema,
    },
    onSubmit: async ({ value }) => {
      const businessId = user.business.id
      if (!businessId) return

      const defaults = resolveDefaults(businessId)
      if (!defaults) {
        toast.error('Default catalog not found. Please contact support.')
        return
      }

      const productId = uuid()
      const variantId = uuid()
      const now = new Date()

      const result = await dbTransaction(() => {
        // Create the provisional product
        productCollection.insert({
          id: productId,
          name: value.name.trim(),
          image: null,
          type: ResourceType.SERVICE, // No inventory deduction until owner reviews
          isAvailable: true,
          hasExpiry: false,
          requiresDeposit: false,
          depositAmount: null,
          durationMinutes: null,
          categoryId: defaults.categoryId,
          baseUnitId: defaults.unitId,
          businessId,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        })

        // Create the default variant with the given price and SKU
        productVariantCollection.insert({
          id: variantId,
          productId,
          name: null,
          image: null,
          sku: value.sku?.trim() || null,
          price: value.price,
          costPrice: 0,
          attributeType: VariantAttributeType.UNSPECIFIED,
          taxCategory: TaxCategory.STANDARD,
          lowStockThreshold: null,
          businessId,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        })
      })

      if (result.isErr()) {
        toast.error('Failed to create product. Please try again.')
        return
      }

      // Build a minimal posProduct shape the cart expects
      const posProduct = {
        id: productId,
        name: value.name.trim(),
        image: null,
        type: ResourceType.SERVICE,
        isAvailable: true,
        hasExpiry: false,
        requiresDeposit: false,
        depositAmount: null,
        durationMinutes: null,
        categoryId: defaults.categoryId,
        baseUnitId: defaults.unitId,
        businessId,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        category: { id: defaults.categoryId, name: 'General', businessId, createdAt: now, updatedAt: now, deletedAt: null },
        baseUnit: {
          id: defaults.unitId,
          name: defaults.unitName,
          abbreviation: 'pcs',
          type: 'COUNT' as const,
          conversionFactor: 1,
          isBaseUnit: true,
          businessId,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        },
        variants: [
          {
            id: variantId,
            productId,
            name: null,
            image: null,
            sku: value.sku?.trim() || null,
            price: value.price,
            costPrice: 0,
            attributeType: VariantAttributeType.UNSPECIFIED,
            taxCategory: TaxCategory.STANDARD,
            lowStockThreshold: null,
            businessId,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            inventory: [],
            components: [],
          },
        ],
      }

      onConfirm({
        cartId: uuid(),
        product: posProduct as never,
        variant: posProduct.variants[0] as never,
        quantity: 1,
        addons: [],
      })

      toast.success(`"${value.name.trim()}" added to cart`)
      onClose()
    },
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-sm gap-0 p-0 overflow-hidden rounded-3xl [&>button]:hidden'>
        {/* Header */}
        <DialogHeader className='flex flex-row items-center justify-between px-6 pt-6 pb-4 border-b border-border gap-4 space-y-0'>
          <div className='flex items-center gap-3'>
            <div className='w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0'>
              <PackagePlus className='w-4 h-4 text-primary' />
            </div>
            <div>
              <DialogTitle className='text-base font-bold leading-tight'>Quick Add</DialogTitle>
              <p className='text-xs text-muted-foreground mt-0.5'>Sell now, complete the catalog later</p>
            </div>
          </div>
          <Button type='button' variant='ghost' size='icon' onClick={onClose} className='shrink-0 rounded-xl'>
            <X className='w-4 h-4' />
          </Button>
        </DialogHeader>

        {/* Form */}
        <Form onSubmit={form.handleSubmit} className='p-6 space-y-4'>
          <form.Field name='name'>
            {field => <TextInput field={field} label='Product name' placeholder='e.g. Banana Chips, Haircut, Repair fee' autoFocus />}
          </form.Field>

          <form.Field name='sku'>{field => <TextInput field={field} label='SKU (Optional)' placeholder='e.g. PROD-001' />}</form.Field>

          <form.Field name='price'>{field => <MoneyInput field={field} label='Price' placeholder='0.00' />}</form.Field>

          <p className='text-xs text-muted-foreground leading-snug'>
            This creates a provisional product. You can add a category, image, and cost price later from the Products page.
          </p>

          <form.Subscribe selector={s => [s.canSubmit, s.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <Button type='submit' disabled={!canSubmit} className='w-full gap-2'>
                <PackagePlus className='w-4 h-4' />
                {isSubmitting ? 'Adding…' : 'Add to cart'}
              </Button>
            )}
          </form.Subscribe>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
