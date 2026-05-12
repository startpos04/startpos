import { type ColumnDef, createColumnHelper } from '@tanstack/react-table'

// Helper for type-safe columns
// biome-ignore lint/suspicious/noExplicitAny: Required to allow diverse column value types in a single array
export const getColumns = <T,>(columns: (helper: ReturnType<typeof createColumnHelper<T>>) => ColumnDef<T, any>[]) => {
  const helper = createColumnHelper<T>()
  return columns(helper)
}
