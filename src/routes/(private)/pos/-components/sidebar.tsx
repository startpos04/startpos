import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { APP_SHORT_NAME } from '@/lib/constants'
import { fetchCategoryOptions } from '@/lib/queries/fetch-category-options'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Utensils } from 'lucide-react'

export function Sidebar() {
  const { category: activeCategory } = useSearch({ from: '/(private)/pos/' })
  const navigate = useNavigate({ from: '/pos/' })

  const updateCategory = (cat: string) => {
    navigate({
      search: prev => ({ ...prev, category: cat }),
    })
  }

  const { data: categories } = fetchCategoryOptions()

  return (
    <nav className='w-20 flex flex-col items-center py-6 gap-6 bg-card rounded-[2rem] border border-border shadow-sm'>
      <div className='w-12 h-12 bg-primary rounded-2xl flex items-center justify-center text-primary-foreground font-black'>{APP_SHORT_NAME}</div>
      <ScrollArea className='w-full'>
        <div className='flex flex-col items-center gap-4 px-2'>
          <Button variant={activeCategory === 'ALL' ? 'default' : 'ghost'} className='rounded-2xl h-14 w-14' onClick={() => updateCategory('ALL')}>
            <Utensils className='w-6 h-6' />
          </Button>
          {categories?.map(cat => (
            <Button
              key={cat.value}
              variant={activeCategory === cat.value ? 'default' : 'ghost'}
              className='rounded-2xl h-14 w-14'
              onClick={() => updateCategory(cat.value)}
            >
              <span className='text-xs font-bold text-center leading-tight'>{cat.label.substring(0, 3).toUpperCase()}</span>
            </Button>
          ))}
        </div>
      </ScrollArea>
    </nav>
  )
}
