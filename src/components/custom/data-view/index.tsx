import { ColumnDef, createColumnHelper } from '@tanstack/react-table'

// Helper for type-safe columns
export const getColumns = <T,>(columns: (helper: ReturnType<typeof createColumnHelper<T>>) => ColumnDef<T, any>[]) => {
  const helper = createColumnHelper<T>()
  return columns(helper)
}
