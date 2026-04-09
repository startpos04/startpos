import { getColumns } from '@/components/custom/data-view'
import GridView from '@/components/custom/data-view/grid-view'
import { ThemeToggle } from '@/components/custom/theme/theme-toggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { withForm } from '@/hooks/form'
import { authClient } from '@/lib/better-auth/auth-client'
import { APP_NAME } from '@/lib/constants'
import { posItem, posProductProps } from '@/lib/conversion/inventory-engine'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useStore } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import dayjs from 'dayjs'
import _ from 'lodash'
import { LogOut, Search } from 'lucide-react'
import { useMemo } from 'react'
import { posFormOpts } from '..'
import { ProductCard } from './product-card'

export const ProductGrid = withForm({
  ...posFormOpts,
  render: function ({ form }) {
    const { q: searchQuery, category: activeCategory } = useSearch({ from: '/(private)/pos/' })
    const navigate = useNavigate({ from: '/pos/' })
    const updateSearch = (q?: string) => navigate({ search: prev => ({ ...prev, q: q || '' }) })
    const cartItems = useStore(form.store, s => s.values.items)

    const { data, isFetching } = useQuery({
      queryKey: ['pos-products', activeCategory, searchQuery],
      queryFn: async () => {
        const result = await crudAPI.product('findMany', {
          where: {
            isAvailable: true,
            variants: {
              every: {
                price: { gt: 0 },
              },
            },
            ...(activeCategory !== 'ALL' && { categoryId: activeCategory }),
            ...(searchQuery && {
              OR: [{ name: { contains: searchQuery, mode: 'insensitive' } }, { variants: { some: { sku: { contains: searchQuery, mode: 'insensitive' } } } }],
            }),
          },
          include: posProductProps,
        })

        if (result.isErr()) throw new Error(result.error)
        return result.value
      },
    })

    const columns = useMemo(
      () => getColumns<NonNullable<typeof data>[number]>(h => [h.accessor('name', { header: 'Product' }), h.accessor('category.name', { header: 'Category' })]),
      [],
    )

    const handleLogout = () => {
      authClient.signOut(
        {},
        {
          onSuccess: () => navigate({ to: '/', reloadDocument: true }),
        },
      )
    }

    const handleAddToCart = (newItem: posItem) => {
      const currentItems = form.getFieldValue('items') as posItem[]

      const existingItemIndex = currentItems.findIndex(i => {
        const isSameProduct = i.product.id === newItem.product.id
        const isSameVariant = i.variant.id === newItem.variant?.id

        // Deep compare addons to ensure we don't merge different customizations
        // (e.g., Coffee with Sugar vs Coffee without Sugar)
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
        <header className='flex justify-between items-center bg-card/80 backdrop-blur-md p-4 rounded-[2.5rem] border border-border mx-4 mt-2'>
          <div className='hidden lg:block px-4 border-r border-border mr-4'>
            <h1 className='text-xl font-black tracking-tighter'>{APP_NAME}</h1>
            <p className='text-muted-foreground text-[10px] font-bold uppercase tracking-widest'>{dayjs().format('ddd, MMM DD · HH:mm')}</p>
          </div>

          <div className='relative flex-1 max-w-xl'>
            <Search className='absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50' />
            <Input
              value={searchQuery}
              onChange={e => updateSearch(e.target.value)}
              className='pl-11 h-12 rounded-2xl bg-muted/40 border-none focus-visible:ring-1 focus-visible:ring-primary/20 transition-all'
              placeholder='Search by name or SKU...'
            />
          </div>

          <div className='flex items-center gap-3 ml-4'>
            <ThemeToggle />
            <Button
              variant='ghost'
              size='sm'
              className='rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive font-bold text-xs'
              onClick={handleLogout}
            >
              <LogOut className='w-4 h-4 mr-2' /> LOGOUT
            </Button>
          </div>
        </header>

        <div className='flex-1 overflow-y-auto custom-scrollbar'>
          <GridView<NonNullable<typeof data>[number]>
            data={data}
            isFetching={isFetching}
            columns={columns}
            className='px-4 pb-8'
            // We pass the global cartItems store value to each card
            // so they can individually calculate their remaining yield/stock
            renderCard={row => <ProductCard key={row.original.id} product={row.original} cartItems={cartItems} onAdd={handleAddToCart} />}
          />
        </div>
      </main>
    )
  },
})
