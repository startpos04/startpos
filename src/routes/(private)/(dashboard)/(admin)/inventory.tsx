import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { MoreVertical, Plus, Leaf } from 'lucide-react'

const INVENTORY_DATA = [
  {
    id: 1,
    name: 'Classic Oat Latte',
    category: 'Coffee',
    stock: 85,
    status: 'In Stock',
    ingredients: ['Espresso Roast', 'Oat Milk', 'Filtered Water', 'Vanilla Syrup (Optional)'],
    unit: 'cups',
  },
  {
    id: 2,
    name: 'Matcha Green Tea',
    category: 'Tea',
    stock: 12,
    status: 'Low Stock',
    ingredients: ['Ceremonial Matcha', 'Hot Water', 'Honey', 'Almond Milk'],
    unit: 'cups',
  },
  {
    id: 3,
    name: 'Avocado Sourdough',
    category: 'Food',
    stock: 45,
    status: 'In Stock',
    ingredients: ['Sourdough Bread', 'Hass Avocado', 'Red Pepper Flakes', 'Lemon Juice', 'Sea Salt'],
    unit: 'servings',
  },
]

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/inventory')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div>
      {/* Header Section */}
      <div className='flex justify-between items-end mb-8'>
        <h1 className='text-3xl font-bold tracking-tight text-slate-900'>Inventory</h1>
        <Button className='rounded-xl shadow-lg bg-indigo-600 hover:bg-indigo-700'>
          <Plus className='mr-2 h-4 w-4' /> Add New Product
        </Button>
      </div>

      {/* Grid Layout */}
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
        {INVENTORY_DATA.map(product => (
          <Card key={product.id} className='border-none shadow-sm rounded-[2rem] overflow-hidden bg-white/80 backdrop-blur-md'>
            <CardHeader className='pb-2'>
              <div className='flex justify-between items-start'>
                <Badge variant={product.status === 'Low Stock' ? 'destructive' : 'secondary'} className='rounded-full px-3'>
                  {product.status}
                </Badge>
                <Button variant='ghost' size='icon' className='text-slate-400'>
                  <MoreVertical className='h-5 w-5' />
                </Button>
              </div>
              <CardTitle className='text-xl mt-2 font-bold'>{product.name}</CardTitle>
              <CardDescription>{product.category}</CardDescription>
            </CardHeader>

            <CardContent className='space-y-6'>
              {/* Stock Level Indicator */}
              <div className='space-y-2'>
                <div className='flex justify-between text-sm font-medium'>
                  <span className='text-slate-500'>Stock Level</span>
                  <span>{product.stock}%</span>
                </div>
                <Progress
                  value={product.stock}
                  className={`h-2 ${product.stock < 20 ? `bg-red-100 [&>div]:bg-red-500` : `bg-slate-100 [&>div]:bg-indigo-500`}`}
                />
              </div>

              {/* Ingredients Section */}
              <div className='space-y-3'>
                <h4 className='text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2'>
                  <Leaf className='w-3 h-3 text-emerald-500' /> Ingredients / Recipe
                </h4>
                <div className='flex flex-wrap gap-2'>
                  {product.ingredients.map((ing, index) => (
                    <Badge key={index} variant='outline' className='bg-white border-slate-200 text-slate-600 font-normal py-1 px-3 rounded-lg'>
                      {ing}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Quick Actions Footer */}
              <div className='pt-4 border-t flex gap-2'>
                <Button variant='outline' className='flex-1 rounded-xl border-slate-200 text-xs'>
                  Adjust Stock
                </Button>
                <Button variant='outline' className='flex-1 rounded-xl border-slate-200 text-xs text-indigo-600 border-indigo-50'>
                  Edit Recipe
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
