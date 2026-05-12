import { useStore } from '@tanstack/react-form'
import { useSearch } from '@tanstack/react-router'
import _ from 'lodash'
import { useMemo } from 'react'
import { getColumns } from '@/components/custom/data-view'
import GridView from '@/components/custom/data-view/grid-view'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { withForm } from '@/hooks/form'
import { usePOS } from '@/hooks/use-pos'
import type { posItem } from '@/lib/conversion/inventory-engine'
import type { OverlayProps } from '@/lib/overlay'
import { SearchInput } from '../../orders/-components/search-input'
import { posFormOpts } from '..'
import { PosHeader } from './header'
import { ProductCard } from './product-card'

export const ProductGridModal = withForm({
  ...posFormOpts,
  props: {} as OverlayProps,
  render: ({ open, onClose, form }) => {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className='p-1 h-[95dvh] max-h-[95dvh] flex flex-col space-y-2'>
          <main className='flex-1 flex flex-col gap-2 md:gap-6 overflow-hidden'>
            <header className='flex justify-between items-center'>
              <SearchInput />
            </header>
            <div className='flex flex-1 overflow-y-auto custom-scrollbar'>
              <Products form={form} onClose={onClose} />
            </div>
          </main>
        </DialogContent>
      </Dialog>
    )
  },
})

export const ProductGrid = withForm({
  ...posFormOpts,
  render: ({ form }) => {
    return (
      <main className='flex-1 flex flex-col gap-2 md:gap-6 overflow-hidden'>
        <PosHeader />

        <div className='flex flex-1 overflow-y-auto custom-scrollbar'>
          <Products form={form} />
        </div>
      </main>
    )
  },
})

export const Products = withForm({
  ...posFormOpts,
  props: {} as Partial<OverlayProps>,
  render: ({ form, onClose }) => {
    const { q: searchQuery, orderId } = useSearch({ from: '/(private)/pos/' })
    const cartItems = useStore(form.store, s => s.values.items)
    const { posProducts, isLoading } = usePOS(orderId, searchQuery)

    const columns = useMemo(
      () =>
        getColumns<NonNullable<typeof posProducts>[number]>(h => [
          h.accessor('name', { header: 'Product' }),
          h.accessor('category.name', { header: 'Category' }),
        ]),
      [],
    )

    const handleAddToCart = (newItem: posItem) => {
      const currentItems = form.getFieldValue('items') as posItem[]

      const existingItemIndex = currentItems.findIndex(i => {
        const isSameProduct = i.product.id === newItem.product.id
        const isSameVariant = i.variant.id === newItem.variant?.id
        const isSameAddons = _.isEqual(_.sortBy(i.addons, 'id'), _.sortBy(newItem.addons, 'id'))

        return isSameProduct && isSameVariant && isSameAddons
      })

      if (existingItemIndex !== -1) {
        const currentQty = currentItems[existingItemIndex]?.quantity || 0
        form.setFieldValue(`items[${existingItemIndex}].quantity`, currentQty + newItem.quantity)
      } else {
        form.pushFieldValue('items', newItem)
      }

      onClose?.()
    }

    return (
      <GridView<NonNullable<typeof posProducts>[number]>
        data={posProducts}
        isFetching={isLoading}
        columns={columns}
        renderCard={row => <ProductCard key={row.original.id} product={row.original} cartItems={cartItems} onAdd={handleAddToCart} />}
      />
    )
  },
})
