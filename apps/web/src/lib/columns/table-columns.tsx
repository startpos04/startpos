/** biome-ignore-all lint/suspicious/noExplicitAny: TODO: fix */
import type { ColumnHelper, DisplayColumnDef } from '@tanstack/react-table'

export const tableCols = {
  number: (h: ColumnHelper<any>) =>
    h.display({
      id: 'number',
      maxSize: 40,
      header: 'No.',
      cell: info => <span className='text-xs font-mono text-muted-foreground/50'>{(info.row.index + 1).toString().padStart(2, '0')}</span>,
    }),
  action: (h: ColumnHelper<any>, props: Partial<DisplayColumnDef<any>>) =>
    h.display({
      maxSize: 100,
      id: 'actions',
      header: () => <div className='text-right pr-4'>Actions</div>,
      ...props,
    }),
}
