import type { ColumnDef, Row } from '@tanstack/react-table'
import { debounce } from 'lodash'
import { Grid3X3, Plus, TablePropertiesIcon } from 'lucide-react'
import { type ChangeEvent, useCallback } from 'react'
import { GridView } from '@/components/custom/data-view/grid-view'
import { TableView } from '@/components/custom/data-view/table-view'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Input } from '@/components/ui/input'
import type { DataViewProps } from '.'

type TableViewConfig<T> = {
  type: 'table' // biome-ignore lint/suspicious/noExplicitAny: V (Value) must be any to allow columns to have different return types
  columns: ColumnDef<T, any>[]
  selectableRow?: {
    onClick: (product: T) => void
  }
}
type GridViewConfig<T> = { type: 'grid'; renderCard: (row: Row<T>) => React.ReactNode }

interface MultiViewProps<T> extends DataViewProps<T> {
  label?: string
  description?: string
  views: {
    onViewChange?: (view: 'grid' | 'table') => void
    selectedView?: 'grid' | 'table'
    list: (TableViewConfig<T> | GridViewConfig<T>)[]
  }
  creatable?: {
    label: string
    href: string
    onAdd: (e: React.MouseEvent<HTMLAnchorElement>) => void
  }
}

const VIEWS = {
  table: { label: 'Table', Component: TableView, Icon: TablePropertiesIcon },
  grid: { label: 'Grid', Component: GridView, Icon: Grid3X3 },
} as const

export function MultiView<T>({ views, creatable, searchable, label, description, ...props }: MultiViewProps<T>) {
  views.selectedView = views.selectedView || views.list[0]?.type || 'table'
  const SearchComponent = searchable ? searchable.Component : null

  const handleSearchChange = useCallback(
    debounce((e: ChangeEvent<HTMLInputElement, HTMLInputElement>) => {
      if (searchable) {
        searchable.onSearchChange(e.target.value)
      }
    }, 250),
    [],
  )

  return (
    <>
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-4'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight text-foreground'>{label}</h1>
          <p className='text-muted-foreground text-sm'>{description}</p>
        </div>

        <div className='space-y-2'>
          <div className='flex items-center gap-2 justify-end'>
            {SearchComponent === undefined ? (
              <Input className='h-6' placeholder='Search...' defaultValue={searchable?.searchValue} onChange={handleSearchChange} />
            ) : (
              SearchComponent
            )}
            {creatable ? (
              <a href={creatable.href} onClick={creatable.onAdd} className='contents'>
                <Button className='shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]' size='sm'>
                  <Plus className='h-4! w-4!' /> {creatable.label}
                </Button>
              </a>
            ) : null}
          </div>

          <div className='flex items-center gap-2 justify-end'>
            {views.list.length > 1 ? (
              <ButtonGroup>
                {views.list.map(({ type }) => {
                  const { Icon, label } = VIEWS[type]
                  return (
                    <Button key={type} variant={views.selectedView === type ? 'default' : 'outline'} onClick={() => views.onViewChange?.(type)} size='sm'>
                      <Icon /> {label}
                    </Button>
                  )
                })}
              </ButtonGroup>
            ) : null}
          </div>
        </div>
      </div>

      {views.list.map(viewConfig => {
        if (views.selectedView !== viewConfig.type) return null
        const { Component } = VIEWS[viewConfig.type]
        const { type, ...rest } = viewConfig

        // biome-ignore lint/suspicious/noExplicitAny: Component type and props are guaranteed to match via the active view runtime filter.
        return <Component key={type} {...(rest as any)} {...props} />
      })}
    </>
  )
}
