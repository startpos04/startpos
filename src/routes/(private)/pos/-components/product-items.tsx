import { useStore } from '@tanstack/react-form'
import { useNavigate, useSearch } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import _ from 'lodash'
import { useMemo } from 'react'
import { getColumns } from '@/components/custom/data-view'
import { MultiView } from '@/components/custom/data-view/multi-view'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { withForm } from '@/hooks/form'
import { usePOS } from '@/hooks/use-pos'
import { productCols } from '@/lib/columns/product-columns'
import { tableCols } from '@/lib/columns/table-columns'
import { InventoryEngine, type posItem } from '@/lib/conversion/inventory-engine'
import { type OverlayProps, showModal } from '@/lib/overlay'
import type { posProduct } from '@/lib/queries/fetch-pos-products'
import { SearchInput } from '../../orders/-components/search-input'
import { posFormOpts } from '..'
import { PosHeader } from './header'
import { ProductCard } from './product-card'
import { ProductDialog } from './product-dialog'

export const ProductItemsModal = withForm({
  ...posFormOpts,
  props: {} as OverlayProps,
  render: ({ open, onClose, form }) => {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className='p-1 h-[95dvh] max-h-[95dvh] flex flex-col space-y-2'>
          <main className='flex-1 flex flex-col gap-2 overflow-hidden'>
            <header className='flex justify-between items-center'>
              <SearchInput />
            </header>
            <Products form={form} onClose={onClose} />
          </main>
        </DialogContent>
      </Dialog>
    )
  },
})

export const ProductItems = withForm({
  ...posFormOpts,
  render: ({ form }) => {
    return (
      <main className='flex-1 flex flex-col gap-2 overflow-hidden'>
        <PosHeader />
        <Products form={form} />
      </main>
    )
  },
})

export const Products = withForm({
  ...posFormOpts,
  props: {} as Partial<OverlayProps>,
  render: ({ form, onClose }) => {
    const { view = 'table', search = '', page = 1, pageSize = 20 } = useSearch({ from: '/(private)/pos/' })
    const cartItems = useStore(form.store, s => s.values.items)
    const { posProducts, totalItemsPosProducts, orderItems, isLoading } = usePOS({ searchQuery: search, page, pageSize })
    const navigate = useNavigate({ from: '/pos/' })

    const columns = useMemo(
      () =>
        getColumns<posProduct>(
          h =>
            [
              tableCols.number(h),
              productCols.image(h),
              productCols.name(h),
              productCols.sku(h),
              productCols.category(h),
              productCols.unit(h),
              productCols.servings(h, { orderItems, cartItems }),
              productCols.price(h),

              // biome-ignore lint/suspicious/noExplicitAny: TODO: fix any
            ] as ColumnDef<posProduct, any>[],
        ),
      [orderItems, cartItems],
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

    const handleOpenConfig = (product: posProduct) => {
      const variant = product.variants[0]!
      if (InventoryEngine.calculateRemainingYield(product, variant, [], cartItems, orderItems) < 1) return

      showModal(ProductDialog, {
        product,
        cartItems,
        onConfirm: handleAddToCart,
      })
    }

    return (
      <MultiView<posProduct>
        data={posProducts}
        isFetching={isLoading}
        paginable={{
          pageSize,
          pageIndex: page - 1,
          totalItems: totalItemsPosProducts,
          onPaginationChange: next => {
            navigate({ search: prev => ({ ...prev, page: next.pageIndex + 1, 'page-size': next.pageSize }), replace: true })
          },
        }}
        searchable={{
          Component: null,
          searchValue: search,
          onSearchChange: search => {
            navigate({ search: prev => ({ ...prev, search }), replace: true })
          },
        }}
        views={{
          onViewChange: view => {
            navigate({ search: prev => ({ ...prev, view }), replace: true })
          },
          selectedView: view,
          list: [
            {
              type: 'table',
              columns,
              selectableRow: {
                onClick: handleOpenConfig,
              },
            },
            {
              type: 'grid',
              renderCard: row => <ProductCard key={row.original.id} product={row.original} cartItems={cartItems} onAdd={handleAddToCart} />,
            },
          ],
        }}
      />
    )
  },
})
