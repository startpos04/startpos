import { type ColumnDef, createColumnHelper } from '@tanstack/react-table'
import type { ReactNode } from 'react'

export interface Paginable {
  pageIndex: number
  pageSize: number
  totalItems: number
  onPaginationChange: (next: { pageIndex: number; pageSize: number }) => void
}

export interface Searchable {
  Component?: ReactNode
  searchValue: string
  onSearchChange: (search: string) => void
}

export interface DataViewProps<T> {
  data: T[] | undefined
  isFetching: boolean
  emptyMessage?: string
  className?: string
  renderEmpty?: () => ReactNode
  paginable?: Paginable
  searchable?: Searchable
}

// Helper for type-safe columns
// biome-ignore lint/suspicious/noExplicitAny: Required to allow diverse column value types in a single array
export const getColumns = <T,>(columns: (helper: ReturnType<typeof createColumnHelper<T>>) => ColumnDef<T, any>[]) => {
  const helper = createColumnHelper<T>()
  return columns(helper)
}
