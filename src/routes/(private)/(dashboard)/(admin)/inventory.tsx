import { getColumns } from '@/components/custom/data-view'
import GridView from '@/components/custom/data-view/grid-view'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Coffee, Leaf, MoreVertical, Plus } from 'lucide-react'
import { useMemo } from 'react'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/inventory')({
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
              type: { equals: 'BUNDLE' },
            },
            include: {
              category: true,
              ingredients: { include: { component: true } },
            },
          },
        },
      })
    },
  })

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
          <h1 className='text-3xl font-bold tracking-tight text-foreground'>Inventory</h1>
          <p className='text-muted-foreground text-sm'>Monitor stock levels and manage product recipes.</p>
        </div>
        <Button className='rounded-xl shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]'>
          <Plus className='mr-2 h-4 w-4' /> Add Product
        </Button>
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

                <div className='absolute top-4 left-4'>
                  <Badge variant={stockLevel < 20 ? 'destructive' : 'secondary'} className='rounded-full px-3 shadow-sm backdrop-blur-md bg-opacity-90'>
                    {stockLevel < 20 ? 'Low Stock' : 'In Stock'}
                  </Badge>
                </div>
              </div>

              <CardHeader className='pb-2'>
                <CardTitle className='text-xl font-bold line-clamp-1 text-card-foreground'>{product.name}</CardTitle>
                <CardDescription className='text-muted-foreground'>{product.category?.name || 'Uncategorized'}</CardDescription>
              </CardHeader>

              <CardContent className='space-y-6 flex-1 flex flex-col justify-between'>
                <div className='space-y-2'>
                  <div className='flex justify-between text-sm font-medium'>
                    <span className='text-muted-foreground'>Stock Level</span>
                    <span className='text-foreground'>{stockLevel}%</span>
                  </div>
                  <Progress value={stockLevel} className={`h-2 bg-secondary ${stockLevel < 20 ? `[&>div]:bg-destructive` : `[&>div]:bg-primary`}`} />
                </div>

                <div className='space-y-3'>
                  <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2'>
                    <Leaf className='w-3 h-3 text-emerald-500' /> Ingredients / Recipe
                  </h4>
                  <div className='flex flex-wrap gap-2'>
                    {product.ingredients?.length > 0 ? (
                      product.ingredients.map((ing: any) => (
                        <Badge key={ing.id} variant='outline' className='bg-background border-border text-foreground font-normal py-1 px-3 rounded-lg'>
                          {ing.component.name}
                        </Badge>
                      ))
                    ) : (
                      <span className='text-xs text-muted-foreground italic'>No ingredients listed</span>
                    )}
                  </div>
                </div>

                <div className='pt-4 border-t border-border flex gap-2'>
                  <Button variant='outline' className='flex-1 rounded-xl text-xs hover:bg-accent hover:text-accent-foreground'>
                    Adjust Stock
                  </Button>
                  <Button variant='outline' className='flex-1 rounded-xl text-xs text-primary hover:bg-primary/10 border-primary/20'>
                    Edit Recipe
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
