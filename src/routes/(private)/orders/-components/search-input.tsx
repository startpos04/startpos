import { useNavigate, useSearch } from '@tanstack/react-router'
import _ from 'lodash'
import { Search } from 'lucide-react'
import { type ChangeEvent, useCallback } from 'react'
import { Input } from '@startpos-core/components/ui/input'

export const SearchInput = () => {
  const { search: searchQuery } = useSearch({ from: '/(private)/pos/' })
  const navigate = useNavigate({ from: '/pos/' })

  const handleSearchChange = useCallback(
    _.debounce((e: ChangeEvent<HTMLInputElement, HTMLInputElement>) => {
      navigate({ search: prev => ({ ...prev, search: e.target.value }) })
    }, 250),
    [],
  )

  return (
    <div className='relative flex-1 max-w-xl'>
      <Search className='absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50' />
      <Input
        defaultValue={searchQuery}
        onChange={handleSearchChange}
        autoFocus
        className='pl-11 h-12 rounded-2xl bg-muted/40 border-none focus-visible:ring-1 focus-visible:ring-primary/20 transition-all'
        placeholder='Search by name or SKU...'
      />
    </div>
  )
}
