import { getColumns } from '@/components/custom/data-view'
import GridView from '@/components/custom/data-view/grid-view'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { showModal } from '@/lib/Overlay'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Coffee, Layers, Leaf, MoreVertical, Plus, PlusCircle } from 'lucide-react'
import { useMemo } from 'react'
import { CreateProductDialog } from './create'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/products/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { data, isFetching } = useQuery({
    queryKey: ['inventory'],
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
              ingredients: { include: { material: true } },
              allowedAddons: { include: { addon: true } },
              variants: true,
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
        h.display({
          id: 'actions',
          cell: () => (
            <Button variant='ghost' size='icon' className='text-muted-foreground'>
              <MoreVertical className='h-5 w-5' />
            </Button>
          ),
        }),
      ]),
    [],
  )

  return (
    <>
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight text-foreground'>Products</h1>
          <p className='text-muted-foreground text-sm'>Configure product bundles, define ingredient recipes, and manage available add-ons.</p>
        </div>
        <a href='/products/create' onClick={handleAdd} className='contents'>
          <Button className='rounded-xl shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer'>
            <Plus className='h-4 w-4' /> Add Product
          </Button>
        </a>
      </div>

      <GridView<NonNullable<typeof data>[number]>
        data={data}
        isFetching={isFetching}
        columns={columns}
        renderCard={row => {
          const product = row.original
          const stockLevel = 65

          return (
            <Card className='border-border shadow-sm rounded-[2rem] overflow-hidden bg-card/50 backdrop-blur-md h-full flex flex-col transition-colors group pt-0'>
              <div className='relative aspect-video w-full overflow-hidden border-b border-border bg-muted'>
                <Avatar className='w-full h-full [&>img]:rounded-none [&>span]:rounded-none [&:after]:border-none'>
                  <AvatarImage src={product.image ?? ''} alt={product.name} className='object-cover transition-transform duration-300 group-hover:scale-110' />
                  <AvatarFallback className='rounded-none bg-muted flex items-center justify-center'>
                    <Coffee className='w-10 h-10 text-muted-foreground/20 group-hover:text-primary/20 transition-colors' />
                  </AvatarFallback>
                </Avatar>

                <div className='absolute top-4 left-4 flex flex-col gap-2'>
                  <Badge variant={stockLevel < 20 ? 'destructive' : 'secondary'} className='rounded-full px-3 shadow-sm backdrop-blur-md bg-opacity-90'>
                    {stockLevel < 20 ? 'Low Stock' : 'In Stock'}
                  </Badge>
                  {product.variants?.length > 0 && (
                    <Badge variant='outline' className='rounded-full px-3 shadow-sm backdrop-blur-md bg-background/50 text-[10px]'>
                      {product.variants.length} Variants
                    </Badge>
                  )}
                </div>
              </div>

              <CardHeader className='pb-2'>
                <CardTitle className='text-xl font-bold line-clamp-1 text-card-foreground'>{product.name}</CardTitle>
                <CardDescription className='text-muted-foreground'>{product.category?.name || 'Uncategorized'}</CardDescription>
              </CardHeader>

              <CardContent className='space-y-4 flex-1 flex flex-col'>
                {/* Stock Section */}
                <div className='space-y-2'>
                  <div className='flex justify-between text-sm font-medium'>
                    <span className='text-muted-foreground'>Stock Level</span>
                    <span className='text-foreground'>{stockLevel}%</span>
                  </div>
                  <Progress value={stockLevel} className={`h-2 bg-secondary ${stockLevel < 20 ? `[&>div]:bg-destructive` : `[&>div]:bg-primary`}`} />
                </div>

                {/* Ingredients Section */}
                <div className='space-y-2'>
                  <h4 className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2'>
                    <Leaf className='w-3 h-3 text-emerald-500' /> Recipe
                  </h4>
                  <div className='flex flex-wrap gap-1'>
                    {product.ingredients?.map(ing => (
                      <Badge key={ing.id} variant='secondary' className='text-[10px] py-0 px-2 rounded-md font-normal'>
                        {ing.material.name}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Add-ons Section */}
                <div className='space-y-2'>
                  <h4 className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2'>
                    <PlusCircle className='w-3 h-3 text-blue-500' /> Available Add-ons
                  </h4>
                  <div className='flex flex-wrap gap-1'>
                    {product.allowedAddons?.length > 0 ? (
                      product.allowedAddons.map(item => (
                        <Badge key={item.id} variant='outline' className='text-[10px] py-0 px-2 rounded-md border-dashed'>
                          +{item.addon.name}
                        </Badge>
                      ))
                    ) : (
                      <span className='text-[10px] text-muted-foreground italic'>None</span>
                    )}
                  </div>
                </div>

                {/* Variants Section */}
                {product.variants?.length > 0 && (
                  <div className='space-y-2'>
                    <h4 className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2'>
                      <Layers className='w-3 h-3 text-amber-500' /> Variants
                    </h4>
                    <div className='flex flex-wrap gap-1'>
                      {product.variants.map(v => (
                        <Badge key={v.id} variant='outline' className='text-[10px] py-0 px-2 rounded-md bg-amber-500/5 border-amber-500/20'>
                          {v.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className='pt-4 mt-auto border-t border-border flex gap-2'>
                  <Button variant='outline' size='sm' className='flex-1 rounded-xl text-[10px] h-8'>
                    Adjust Stock
                  </Button>
                  <Button variant='outline' size='sm' className='flex-1 rounded-xl text-[10px] h-8 text-primary hover:bg-primary/10 border-primary/20'>
                    Edit Product
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
