import { getColumns } from '@platform/components/custom/data-view'
import { MultiView } from '@platform/components/custom/data-view/multi-view'
import { Button } from '@platform/components/ui/button'
import { Dialog, DialogContent } from '@platform/components/ui/dialog'
import { withForm } from '@platform/hooks/form'
import { useCapability } from '@platform/hooks/use-capability'
import { usePOS } from '@platform/hooks/use-pos'
import { Capabilities } from '@platform/lib/entitlement/capability-keys'
import { useStore } from '@tanstack/react-form'
import { useNavigate, useSearch } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import _ from 'lodash'
import { PackagePlus, PackageSearch, Plus, ShoppingCart } from 'lucide-react'
import { useMemo } from 'react'
import { productCols } from '@/lib/columns/product-columns'
import { tableCols } from '@/lib/columns/table-columns'
import { PosStockEngine, type posItem, stockResultToNumber } from '@/lib/conversion/pos-stock-engine'
import MountManager, { type MountProps } from '@/lib/mount-manager'
import type { posProduct } from '@/lib/queries/fetch-pos-products'
import { SearchInput } from '../../orders/-components/search-input'
import { posFormOpts } from '..'
import { PosHeader } from './header'
import { ProductCard } from './product-card'
import { ProductDialog } from './product-dialog'
import { QuickAddDialog } from './quick-add-dialog'

export const ProductItemsModal = withForm({
  ...posFormOpts,
  props: {} as MountProps,
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
  props: {} as Partial<MountProps>,
  render: ({ form, onClose }) => {
    const { view = 'table', search = '', page = 1, pageSize = 20 } = useSearch({ from: '/(private)/pos/' })
    const cartItems = useStore(form.store, s => s.values.items)
    const { posProducts, totalItemsPosProducts, orderItems, isLoading } = usePOS({ searchQuery: search, page, pageSize })
    const navigate = useNavigate({ from: '/pos/' })
    const hasInventory = useCapability(Capabilities.MANAGE_INVENTORY)

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
              // Only show stock column when inventory tracking is enabled
              hasInventory ? productCols.servings(h, { orderItems, cartItems }) : null,
              productCols.price(h),

              // biome-ignore lint/suspicious/noExplicitAny: TODO: fix any
            ].filter(Boolean) as ColumnDef<posProduct, any>[],
        ),
      [orderItems, cartItems, hasInventory],
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
      const stockResult = PosStockEngine.calculateRemainingYield(product, variant, [], cartItems, orderItems)
      const available = stockResultToNumber(stockResult)
      if (available < 1) return

      MountManager.show(ProductDialog, {
        product,
        cartItems,
        onConfirm: handleAddToCart,
      })
    }

    // â”€â”€ Empty catalog (no search active, no products at all) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (!isLoading && posProducts.length === 0 && !search) {
      return (
        <div className='flex flex-col items-center justify-center flex-1 gap-6 py-16 px-6 text-center'>
          <div className='w-14 h-14 rounded-2xl bg-muted flex items-center justify-center'>
            <ShoppingCart className='w-7 h-7 text-muted-foreground/50' />
          </div>
          <div className='space-y-1.5 max-w-sm'>
            <p className='text-base font-semibold text-foreground'>No products yet</p>
            <p className='text-sm text-muted-foreground leading-snug'>
              You can sell an item right now without setting up a catalog first, or create your products upfront.
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2 items-center'>
            <Button
              variant='default'
              size='sm'
              className='gap-2'
              onClick={() => {
                MountManager.show(QuickAddDialog, { searchQuery: '', onConfirm: handleAddToCart })
              }}
            >
              <PackagePlus className='w-4 h-4' />
              Quick Add an item
            </Button>
            <Button variant='outline' size='sm' className='gap-2' onClick={() => navigate({ to: '/products/create' })}>
              <Plus className='w-4 h-4' />
              Set up catalog
            </Button>
          </div>
        </div>
      )
    }

    // â”€â”€ Search with no results â€” Quick Add entry point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (!isLoading && posProducts.length === 0 && search) {
      return (
        <div className='flex flex-col items-center justify-center flex-1 gap-5 py-16 px-6 text-center'>
          <div className='w-14 h-14 rounded-2xl bg-muted flex items-center justify-center'>
            <PackageSearch className='w-7 h-7 text-muted-foreground/50' />
          </div>
          <div className='space-y-1.5 max-w-sm'>
            <p className='text-base font-semibold text-foreground'>No results for "{search}"</p>
            <p className='text-sm text-muted-foreground leading-snug'>
              This product isn't in your catalog yet. Quick Add it to sell now â€” you can complete its details later.
            </p>
          </div>
          <Button
            size='sm'
            className='gap-2'
            onClick={() => {
              MountManager.show(QuickAddDialog, { searchQuery: search, onConfirm: handleAddToCart })
            }}
          >
            <PackagePlus className='w-4 h-4' />
            Quick Add "{search}"
          </Button>
        </div>
      )
    }

    return (
      <MultiView<posProduct>
        data={posProducts}
        isFetching={isLoading}
        actions={
          <Button
            type='button'
            size='sm'
            variant='outline'
            className='gap-1.5 border-dashed'
            onClick={() => MountManager.show(QuickAddDialog, { searchQuery: '', onConfirm: handleAddToCart })}
          >
            <PackagePlus className='w-4 h-4' />
            Quick Add
          </Button>
        }
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
