import { getColumns } from '@/components/custom/data-view'
import GridView from '@/components/custom/data-view/grid-view'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { showModal } from '@/lib/Overlay'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Coffee, Layers, Leaf, Plus, Sparkles } from 'lucide-react'
import { useMemo } from 'react'
import { CreateProductDialog } from './create'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/products/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { data, isFetching } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      return await crudAPI({
        data: {
          action: 'findMany',
          table: 'product',
          args: {
            where: {
              type: 'BUNDLE',
              variantOfId: null,
            },
            include: {
              category: true,
              baseUnit: true, // Included baseUnit to avoid Prisma errors
              ingredients: {
                include: {
                  material: {
                    include: { inventory: true, baseUnit: true },
                  },
                },
              },
              allowedAddons: { include: { addon: true } },
              variants: { include: { ingredients: true } },
            },
          },
        },
      })
    },
  })

  const handleAdd = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    showModal(CreateProductDialog)
  }

  const columns = useMemo(
    () =>
      getColumns<NonNullable<typeof data>[number]>(h => [
        h.accessor('name', { header: 'Product' }),
        h.accessor('category.name', { header: 'Category' }),
        h.accessor('price', {
          header: 'Base Price',
          cell: info => <span className='font-mono'>${info.getValue().toFixed(2)}</span>,
        }),
      ]),
    [],
  )

  return (
    <>
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight text-foreground'>Product Bundles</h1>
          <p className='text-muted-foreground text-sm'>Manage recipes and real-time availability based on ingredient stock.</p>
        </div>
        <a href='/products/create' onClick={handleAdd} className='contents'>
          <Button className='rounded-xl shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]'>
            <Plus className='h-4 w-4 mr-2' /> Add Product
          </Button>
        </a>
      </div>

      <GridView<NonNullable<typeof data>[number]>
        data={data}
        isFetching={isFetching}
        columns={columns}
        renderCard={row => {
          const product = row.original

          // --- LOGIC: Calculate Availability ---
          const availability = product.ingredients?.map(ing => {
            const currentStock = ing.material.inventory?.reduce((acc, curr) => acc + Number(curr.quantity), 0) ?? 0
            return Math.floor(currentStock / Number(ing.quantityUsed))
          })

          const maxServings = availability?.length ? Math.min(...availability) : 0
          const isLowStock = maxServings < 10
          const stockPercentage = Math.min(Math.max((maxServings / 100) * 100, 0), 100)

          return (
            <Card className='border-border shadow-sm rounded-[2rem] overflow-hidden bg-card/50 backdrop-blur-md h-full flex flex-col transition-all hover:shadow-md group pt-0'>
              {/* Header Image & Badge Section */}
              <div className='relative aspect-video w-full overflow-hidden border-b border-border bg-muted'>
                <Avatar className='w-full h-full [&>img]:rounded-none [&>span]:rounded-none [&:after]:border-none'>
                  <AvatarImage src={product.image ?? ''} alt={product.name} className='object-cover transition-transform duration-500 group-hover:scale-105' />
                  <AvatarFallback className='rounded-none bg-muted flex items-center justify-center'>
                    <Coffee className='w-10 h-10 text-muted-foreground/20' />
                  </AvatarFallback>
                </Avatar>

                <div className='absolute top-4 left-4 flex flex-col gap-2'>
                  <Badge
                    variant={maxServings === 0 ? 'destructive' : isLowStock ? 'warning' : 'secondary'}
                    className='rounded-full px-3 shadow-sm backdrop-blur-md bg-opacity-90'
                  >
                    {maxServings === 0 ? 'Out of Stock' : `${maxServings} Servings Left`}
                  </Badge>
                </div>
              </div>

              <CardHeader className='pb-2'>
                <div className='flex justify-between items-start'>
                  <CardTitle className='text-xl font-bold line-clamp-1'>{product.name}</CardTitle>
                  <span className='font-bold text-primary'>${Number(product.price).toFixed(2)}</span>
                </div>
                <div className='flex items-center gap-2'>
                  <Badge variant='outline' className='text-[9px] uppercase font-bold py-0 h-4'>
                    {product.category?.name || 'General'}
                  </Badge>
                  <span className='text-[10px] text-muted-foreground font-mono uppercase'>{product.sku}</span>
                </div>
              </CardHeader>

              <CardContent className='space-y-4 flex-1 flex flex-col'>
                {/* 1. Production Capacity */}
                <div className='space-y-1.5'>
                  <div className='flex justify-between text-[10px] font-bold uppercase tracking-tight'>
                    <span className='text-muted-foreground'>Stock Logic</span>
                    <span className={isLowStock ? 'text-destructive' : 'text-primary'}>{maxServings} units</span>
                  </div>
                  <Progress
                    value={stockPercentage}
                    className={`h-1.5 bg-secondary ${maxServings === 0 ? '[&>div]:bg-destructive' : isLowStock ? '[&>div]:bg-orange-500' : '[&>div]:bg-primary'}`}
                  />
                </div>

                {/* 2. Ingredients (Composition) */}
                <div className='space-y-2'>
                  <h4 className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2'>
                    <Leaf className='w-3 h-3 text-emerald-500' /> Ingredients
                  </h4>
                  <div className='flex flex-wrap gap-1'>
                    {product.ingredients?.map(ing => (
                      <Badge key={ing.id} variant='secondary' className='text-[9px] py-0 px-1.5 bg-emerald-500/5 text-emerald-700 border-emerald-500/10'>
                        {ing.material.name}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* 3. Variants Section */}
                {product.variants && product.variants.length > 0 && (
                  <div className='space-y-2 p-2.5 rounded-2xl bg-amber-500/5 border border-amber-500/10'>
                    <h4 className='text-[10px] font-bold uppercase tracking-widest text-amber-600 flex items-center gap-2'>
                      <Layers className='w-3 h-3' /> Available Variants
                    </h4>
                    <div className='space-y-1'>
                      {product.variants.map(variant => (
                        <div key={variant.id} className='flex justify-between items-center text-[11px]'>
                          <span className='text-foreground/80'>{variant.name}</span>
                          <span className='font-mono font-medium'>${Number(variant.price).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5. Add-ons (The Upsells) */}
                {product.allowedAddons && product.allowedAddons.length > 0 && (
                  <div className='rounded-2xl border border-blue-500/20 bg-blue-500/5 p-3 dark:bg-blue-500/10'>
                    <h4 className='mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400'>
                      <Sparkles className='h-3.5 w-3.5' /> Optional Add-ons
                    </h4>
                    <div className='flex flex-wrap gap-1.5'>
                      {product.allowedAddons.map(item => (
                        <Badge
                          key={item.id}
                          variant='secondary'
                          className='rounded-lg border-blue-200/50 bg-background/50 px-2 py-0 text-[10px] font-semibold dark:border-blue-800/30'
                        >
                          {item.addon.name} <span className='ml-1 text-blue-600'>+${Number(item.priceOverride).toFixed(2)}</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className='pt-4 mt-auto border-t border-border flex gap-2'>
                  <Button variant='outline' size='sm' className='flex-1 rounded-xl text-[10px] font-bold h-9'>
                    RECIPE
                  </Button>
                  <Button size='sm' className='flex-1 rounded-xl text-[10px] font-bold h-9 shadow-sm'>
                    EDIT PRODUCT
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        }}
      />
    </>
  )
}
