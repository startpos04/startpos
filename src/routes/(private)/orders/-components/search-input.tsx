import { useNavigate, useSearch } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

export const SearchInput = () => {
  const { q: searchQuery } = useSearch({ from: '/(private)/pos/' })
  const navigate = useNavigate({ from: '/pos/' })

  const updateSearch = (q?: string) => navigate({ search: prev => ({ ...prev, q: q || '' }) })

  return (
    <div className='relative flex-1 max-w-xl'>
      <Search className='absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50' />
      <Input
        value={searchQuery}
        onChange={e => updateSearch(e.target.value)}
        className='pl-11 h-12 rounded-2xl bg-muted/40 border-none focus-visible:ring-1 focus-visible:ring-primary/20 transition-all'
        placeholder='Search by name or SKU...'
      />
    </div>
  )
}
