import {
  type ColumnDef,
  filterFns,
  getCoreRowModel,
  getFilteredRowModel,
  type PaginationState,
  type TableOptions,
  type TableState,
  type Updater,
  useReactTable,
} from '@tanstack/react-table'
import type { Paginable, Searchable } from '.'

export interface UseTableViewProps<T> {
  data: T[] | undefined
  // biome-ignore lint/suspicious/noExplicitAny: V (Value) must be any to allow columns to have different return types
  columns: ColumnDef<T, any>[]
  paginable?: Paginable | undefined
  searchable?: Searchable | undefined
}

export function useDataView<T>({ data, columns, paginable, searchable }: UseTableViewProps<T>) {
  const state: Partial<TableState> = {}
  const options: Partial<TableOptions<T>> = {}

  if (searchable) {
    state.globalFilter = searchable.searchValue
    options.globalFilterFn = filterFns.includesString
    options.manualFiltering = true
  }

  if (paginable) {
    state.pagination = {
      pageIndex: paginable.pageIndex,
      pageSize: paginable.pageSize,
    }

    options.manualPagination = true
    options.pageCount = Math.ceil(paginable.totalItems / paginable.pageSize)
    options.onPaginationChange = (updater: Updater<PaginationState>) => {
      const nextState = typeof updater === 'function' ? updater({ pageIndex: paginable.pageIndex, pageSize: paginable.pageSize }) : updater

      paginable.onPaginationChange({
        pageIndex: nextState.pageIndex,
        pageSize: nextState.pageSize,
      })
    }
  }

  return useReactTable({
    data: data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state,
    ...options,
  })
}
