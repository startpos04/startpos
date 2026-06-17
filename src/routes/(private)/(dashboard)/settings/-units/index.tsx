import { useLiveQuery } from '@tanstack/react-db'
import { useMemo } from 'react'
import { getColumns } from '@/components/custom/data-view'
import { MultiView } from '@/components/custom/data-view/multi-view'
import { Badge } from '@/components/ui/badge'
import { unitCollection } from '@/db/collections'

export function UnitsPage() {
  const { data, isLoading } = useLiveQuery(q => q.from({ unit: unitCollection }))

  const columns = useMemo(
    () =>
      getColumns<NonNullable<typeof data>[number]>(h => [
        h.display({
          id: 'number',
          maxSize: 40,
          header: 'No.',
          cell: info => <span className='text-xs font-mono text-muted-foreground/50'>{(info.row.index + 1).toString().padStart(2, '0')}</span>,
        }),

        h.accessor('name', {
          header: 'Unit Name',
          cell: info => <span className='font-semibold text-foreground'>{info.getValue()}</span>,
        }),

        h.accessor('abbreviation', {
          header: 'Abbreviation',
          cell: info => (
            <span className='font-mono text-xs uppercase bg-muted px-1.5 py-0.5 rounded font-bold tracking-wider text-foreground'>{info.getValue()}</span>
          ),
        }),

        h.accessor('type', {
          header: 'Measurement Type',
          cell: info => (
            <Badge variant='outline' className='text-[10px] uppercase font-bold py-0 h-5 text-muted-foreground whitespace-nowrap'>
              {info.getValue()}
            </Badge>
          ),
        }),

        h.accessor('isBaseUnit', {
          header: 'Role',
          cell: info =>
            info.getValue() ? (
              <Badge className='text-[9px] uppercase font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hover:bg-emerald-500/10'>
                Base Unit
              </Badge>
            ) : (
              <Badge variant='secondary' className='text-[9px] uppercase font-medium text-muted-foreground'>
                Derived
              </Badge>
            ),
        }),

        h.accessor('conversionFactor', {
          header: 'Conversion Factor',
          cell: info => {
            const factor = info.getValue()
            const row = info.row.original
            return <span className='font-mono text-xs text-foreground font-medium'>{row.isBaseUnit ? `${factor} (Base)` : `${factor}x Base`}</span>
          },
        }),
      ]),
    [],
  )

  return (
    <MultiView<NonNullable<typeof data>[number]>
      label='Units of Measure'
      description='Configure base scales and conversion matrices for accurate kitchen/retail yield calculations.'
      data={data}
      isFetching={isLoading}
      className='px-4'
      views={{
        list: [{ type: 'table', columns }],
      }}
    />
  )
}
