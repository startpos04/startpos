import { getColumns } from '@/components/custom/data-view'
import GridView from '@/components/custom/data-view/grid-view'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { showModal } from '@/lib/Overlay'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Coffee, Leaf, MoreVertical, Plus } from 'lucide-react'
import { useMemo } from 'react'
import { CreateProductDialog } from './create'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/products/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { data, isFetching } = useQuery({
    queryKey: ['products-list'],
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

          // --- LOGIC: Calculate Availability based on Ingredients ---
          // This finds the "bottleneck" ingredient (the one that runs out first)
          const availability = product.ingredients?.map(ing => {
            const currentStock = ing.material.inventory?.reduce((acc, curr) => acc + Number(curr.quantity), 0) ?? 0
            return Math.floor(currentStock / Number(ing.quantityUsed))
          })

          const maxServings = availability?.length ? Math.min(...availability) : 0
          const isLowStock = maxServings < 10
          // For the progress bar, let's assume 100 servings is "Full" (100%)
          const stockPercentage = Math.min(Math.max((maxServings / 100) * 100, 0), 100)

          return (
            <Card className='border-border shadow-sm rounded-[2rem] overflow-hidden bg-card/50 backdrop-blur-md h-full flex flex-col transition-all hover:shadow-md group pt-0'>
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

                <div className='absolute top-4 right-4'>
                  <Button variant='ghost' size='icon' className='h-8 w-8 rounded-full bg-background/20 backdrop-blur-md hover:bg-background/40'>
                    <MoreVertical className='h-4 w-4 text-white' />
                  </Button>
                </div>
              </div>

              <CardHeader className='pb-2'>
                <div className='flex justify-between items-start'>
                  <CardTitle className='text-xl font-bold line-clamp-1 text-card-foreground'>{product.name}</CardTitle>
                  <span className='font-bold text-primary'>${product.price.toFixed(2)}</span>
                </div>
                <CardDescription className='text-xs flex items-center gap-1'>
                  <Badge variant='outline' className='text-[9px] uppercase font-bold py-0 h-4'>
                    {product.category?.name || 'General'}
                  </Badge>
                  <span className='text-muted-foreground font-mono uppercase'>{product.sku}</span>
                </CardDescription>
              </CardHeader>

              <CardContent className='space-y-4 flex-1 flex flex-col'>
                {/* Dynamic Stock Level based on servings */}
                <div className='space-y-2'>
                  <div className='flex justify-between text-[11px] font-bold uppercase tracking-tighter'>
                    <span className='text-muted-foreground'>Production Capacity</span>
                    <span className={isLowStock ? 'text-destructive' : 'text-primary'}>{maxServings} units</span>
                  </div>
                  <Progress
                    value={stockPercentage}
                    className={`h-1.5 bg-secondary ${maxServings === 0 ? '[&>div]:bg-destructive' : isLowStock ? '[&>div]:bg-orange-500' : '[&>div]:bg-primary'}`}
                  />
                </div>

                {/* Recipe / Ingredients */}
                <div className='space-y-2'>
                  <h4 className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2'>
                    <Leaf className='w-3 h-3 text-emerald-500' /> Composition
                  </h4>
                  <div className='flex flex-wrap gap-1'>
                    {product.ingredients?.map(ing => (
                      <TooltipProvider key={ing.id}>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge
                              variant='secondary'
                              className='text-[10px] py-0 px-2 rounded-md font-medium bg-emerald-500/5 text-emerald-700 border-emerald-500/10'
                            >
                              {ing.material.name}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className='text-[10px]'>
                            Uses {ing.quantityUsed} {ing.material.baseUnit?.abbreviation} per serving
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                  </div>
                </div>

                {/* Add-ons & Variants Summary */}
                <div className='grid grid-cols-2 gap-2 mt-auto'>
                  <div className='p-2 rounded-xl bg-blue-500/5 border border-blue-500/10'>
                    <span className='text-[9px] font-bold text-blue-600 uppercase block mb-1'>Add-ons</span>
                    <span className='text-xs font-semibold'>{product.allowedAddons?.length || 0} Optional</span>
                  </div>
                  <div className='p-2 rounded-xl bg-amber-500/5 border border-amber-500/10'>
                    <span className='text-[9px] font-bold text-amber-600 uppercase block mb-1'>Variants</span>
                    <span className='text-xs font-semibold'>{product.variants?.length || 0} Sizes/Types</span>
                  </div>
                </div>

                <div className='pt-4 border-t border-border flex gap-2'>
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
