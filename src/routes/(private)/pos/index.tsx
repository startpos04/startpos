import { ThemeToggle } from '@/components/custom/theme/theme-toggle'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { authClient } from '@/lib/better-auth/auth-client'
import { APP_NAME, APP_SHORT_NAME } from '@/lib/constants'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Coffee, LogOut, Minus, Plus, Search, Utensils } from 'lucide-react'
import { useState } from 'react'

export const Route = createFileRoute('/(private)/pos/')({
  component: RouteComponent,
})

function RouteComponent() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('ALL')

  // Fetch Categories from your Prisma DB
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => await crudAPI({ data: { action: 'findMany', table: 'category' } }),
  })

  // Fetch Products based on Category/Search
  const { data: products } = useQuery({
    queryKey: ['pos-products', activeCategory, searchQuery],
    queryFn: async () =>
      await crudAPI({
        data: {
          action: 'findMany',
          table: 'product',
          args: {
            where: {
              type: { equals: 'BUNDLE' },
              isAvailable: true,
              ...(activeCategory !== 'ALL' && { categoryId: activeCategory }),
              ...(searchQuery && { name: { contains: searchQuery, mode: 'insensitive' } }),
            },
            include: { category: true },
          },
        },
      }),
  })

  console.log('products', products)

  const handleLogout = () => {
    authClient.signOut(
      {},
      {
        onSuccess: () => navigate({ to: '/', reloadDocument: true }),
      },
    )
  }

  return (
    <div className='flex h-screen w-full bg-background p-4 gap-4 text-foreground transition-colors overflow-hidden'>
      {/* 1. Category Sidebar */}
      <nav className='w-20 flex flex-col items-center py-6 gap-8 bg-card rounded-[2.5rem] shadow-sm border border-border'>
        <div className='w-12 h-12 bg-primary rounded-2xl flex items-center justify-center text-primary-foreground font-black shadow-lg shadow-primary/20'>
          {APP_SHORT_NAME}
        </div>

        <div className='flex flex-col gap-5 flex-1'>
          <Button
            variant={activeCategory === 'ALL' ? 'default' : 'ghost'}
            className='rounded-2xl h-14 w-14 shadow-none'
            onClick={() => setActiveCategory('ALL')}
          >
            <Utensils className='w-6 h-6' />
          </Button>
          {categories?.map((cat: any) => (
            <Button
              key={cat.id}
              variant={activeCategory === cat.id ? 'default' : 'ghost'}
              className='rounded-2xl h-14 w-14'
              onClick={() => setActiveCategory(cat.id)}
            >
              <span className='text-xl'>{cat.name === 'Coffee' ? '☕' : cat.name === 'Dessert' ? '🍰' : '🥗'}</span>
            </Button>
          ))}
        </div>

        <Button variant='ghost' size='icon' className='rounded-full text-muted-foreground' onClick={handleLogout}>
          <LogOut className='w-5 h-5' />
        </Button>
      </nav>

      {/* 2. Main Product Grid */}
      <main className='flex-1 flex flex-col gap-6 overflow-hidden'>
        <header className='flex justify-between items-center'>
          <div>
            <h1 className='text-3xl font-black tracking-tight'>{APP_NAME}</h1>
            <p className='text-muted-foreground text-sm font-medium'>{dayjs().format('dddd, MMM DD, YYYY')}</p>
          </div>
          <ThemeToggle />

          <div className='relative w-80'>
            <Search className='absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground' />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className='pl-11 h-12 rounded-2xl border-none shadow-sm bg-card ring-1 ring-border focus-visible:ring-primary'
              placeholder='Search by name or SKU...'
            />
          </div>
        </header>

        <ScrollArea className='flex-1 pr-4'>
          <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-10'>
            {products?.map(product => (
              <Card
                key={product.id}
                className='border-none shadow-sm bg-card hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group rounded-[2rem] overflow-hidden ring-1 ring-border pt-0'
              >
                <div className='h-32 bg-muted flex items-center justify-center group-hover:bg-primary/5 transition-colors'>
                  <Avatar className='w-full h-full [&>img]:rounded-none [&>span]:rounded-none [&:after]:border-none'>
                    <AvatarImage
                      src={product.image ?? ''}
                      alt={product.name}
                      className='object-cover transition-transform duration-300 group-hover:scale-110'
                    />
                    <AvatarFallback className='rounded-none bg-muted flex items-center justify-center'>
                      <Coffee className='w-10 h-10 text-muted-foreground/20 group-hover:text-primary/20 transition-colors' />
                    </AvatarFallback>
                  </Avatar>
                </div>
                <CardContent className='p-4'>
                  <p className='font-bold text-sm line-clamp-1'>{product.name}</p>
                  <div className='flex justify-between items-center mt-3'>
                    <span className='text-primary font-black text-lg'>₱{Number(product.price).toFixed(2)}</span>
                    <Badge variant='secondary' className='rounded-lg text-[9px] font-bold uppercase tracking-tighter'>
                      {product.category?.name}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </main>

      {/* 3. The Action Cart */}
      <aside className='w-100 bg-card rounded-[3rem] shadow-2xl border border-border flex flex-col overflow-hidden'>
        <div className='p-8 pb-4'>
          <div className='flex justify-between items-center'>
            <h2 className='text-2xl font-black'>Order</h2>
            <Badge className='rounded-full px-3 py-1 font-bold'>3 Items</Badge>
          </div>
        </div>

        <ScrollArea className='flex-1 px-8'>
          <div className='space-y-6'>
            {/* Cart Item Example */}
            <div className='flex items-center gap-4 group'>
              <div className='w-16 h-16 bg-muted rounded-4xl flex items-center justify-center font-bold text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors'>
                CM
              </div>
              <div className='flex-1 min-w-0'>
                <p className='font-bold text-sm truncate'>Caramel Macchiato</p>
                <p className='text-xs text-muted-foreground font-semibold'>₱180.00</p>
              </div>
              <div className='flex items-center gap-1 bg-muted/50 rounded-xl p-1'>
                <Button size='icon' variant='ghost' className='h-8 w-8 rounded-lg hover:bg-background'>
                  <Minus className='w-3' />
                </Button>
                <span className='w-8 text-center text-sm font-black'>1</span>
                <Button size='icon' variant='ghost' className='h-8 w-8 rounded-lg hover:bg-background'>
                  <Plus className='w-3' />
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className='p-8 bg-muted/30 mt-auto border-t border-border space-y-6'>
          <div className='space-y-3'>
            <div className='flex justify-between text-sm font-medium'>
              <span className='text-muted-foreground'>Subtotal</span>
              <span className='font-bold'>₱450.00</span>
            </div>
            <div className='flex justify-between text-sm font-medium'>
              <span className='text-muted-foreground'>Tax (12%)</span>
              <span className='font-bold'>₱54.00</span>
            </div>
            <div className='flex justify-between text-2xl font-black pt-4 border-t border-border'>
              <span>Total</span>
              <span className='text-primary'>₱504.00</span>
            </div>
          </div>
          <Button className='w-full py-8 rounded-[1.5rem] text-xl font-black shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all'>
            Checkout
          </Button>
        </div>
      </aside>
    </div>
  )
}
