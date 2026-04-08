import { getColumns } from '@/components/custom/data-view'
import GridView from '@/components/custom/data-view/grid-view'
import { ThemeToggle } from '@/components/custom/theme/theme-toggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { withForm } from '@/hooks/form'
import { authClient } from '@/lib/better-auth/auth-client'
import { APP_NAME } from '@/lib/constants'
import { posItem, posProductProps } from '@/lib/conversion/inventory-engine'
import { PriceEngine } from '@/lib/conversion/price-engine'
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
            variantOfId: null,
            price: { gt: 0 },
            ...(activeCategory !== 'ALL' && { categoryId: activeCategory }),
            ...(searchQuery && {
              OR: [{ name: { contains: searchQuery, mode: 'insensitive' } }, { sku: { contains: searchQuery, mode: 'insensitive' } }],
            }),
          },
          ...posProductProps,
        })

        if (result.isErr()) throw new Error(result.error)
        return result.value
      },
    })

    const columns = useMemo(
      () =>
        getColumns<NonNullable<typeof data>[number]>(h => [
          h.accessor('name', { header: 'Product' }),
          h.accessor('category.name', { header: 'Category' }),
          h.accessor('price', {
            header: 'Base Price',
            cell: info => <span className='font-mono'>{PriceEngine.format(info.getValue())}</span>,
          }),
        ]),
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

    const handleAddToCart = (item: posItem) => {
      const currentItems = form.getFieldValue('items') as posItem[]

      const existingItemIndex = currentItems.findIndex(i => {
        if (i.product.id !== item.product.id) return false
        if (i.variant && i.variant.id !== item.variant?.id) return false
        if (!_.isEqual(i.addons, item.addons)) return false

        return true
      })

      if (existingItemIndex !== -1) {
        const currentQty = currentItems[existingItemIndex]?.quantity || 0
        form.setFieldValue(`items[${existingItemIndex}].quantity`, currentQty + item.quantity)
      } else {
        form.pushFieldValue('items', item)
      }
    }

    return (
      <main className='flex-1 flex flex-col gap-6 '>
        <header className='flex justify-between items-center bg-card p-4 rounded-[2rem] border border-border'>
          <div className='hidden md:block px-2'>
            <h1 className='text-xl font-black'>{APP_NAME}</h1>
            <p className='text-muted-foreground text-xs font-medium'>{dayjs().format('ddd, MMM DD · HH:mm')}</p>
          </div>
          <div className='relative w-full max-w-md mx-4'>
            <Search className='absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground' />
            <Input
              value={searchQuery}
              onChange={e => updateSearch(e.target.value)}
              className='pl-11 h-12 rounded-2xl bg-muted/50 border-none'
              placeholder='Search products...'
            />
          </div>
          <div className='flex items-center gap-5'>
            <ThemeToggle />
            <Button variant='outline' className='rounded-xl border-dashed' onClick={handleLogout}>
              <LogOut className='w-5 h-5' /> Logout
            </Button>
          </div>
        </header>
        <GridView<NonNullable<typeof data>[number]>
          data={data}
          isFetching={isFetching}
          columns={columns}
          className='px-4'
          renderCard={row => <ProductCard key={row.original.id} product={row.original} cartItems={cartItems} onAdd={handleAddToCart} />}
        />
      </main>
    )
  },
})
