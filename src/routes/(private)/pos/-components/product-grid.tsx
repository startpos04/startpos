import { getColumns } from '@/components/custom/data-view'
import GridView from '@/components/custom/data-view/grid-view'
import { withForm } from '@/hooks/form'
import { usePOS } from '@/hooks/use-pos'
import { posItem } from '@/lib/conversion/inventory-engine'
import { useStore } from '@tanstack/react-form'
import { useSearch } from '@tanstack/react-router'
import _ from 'lodash'
import { useMemo } from 'react'
import { posFormOpts } from '..'
import { PosHeader } from './header'
import { ProductCard } from './product-card'

export const ProductGrid = withForm({
  ...posFormOpts,
  render: function ({ form }) {
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
    }

    return (
      <main className='flex-1 flex flex-col gap-6 overflow-hidden'>
        <PosHeader />

        <div className='flex flex-1 overflow-y-auto custom-scrollbar'>
          <GridView<NonNullable<typeof posProducts>[number]>
            data={posProducts}
            isFetching={isLoading}
            columns={columns}
            className='px-4 pb-8'
            renderCard={row => <ProductCard key={row.original.id} product={row.original} cartItems={cartItems} onAdd={handleAddToCart} />}
          />
        </div>
      </main>
    )
  },
})
