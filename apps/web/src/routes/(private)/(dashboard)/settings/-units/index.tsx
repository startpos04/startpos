import { getColumns } from '@platform/components/custom/data-view'
import { MultiView } from '@platform/components/custom/data-view/multi-view'
import { WarningPrompt } from '@platform/components/custom/prompt/warning-prompt'
import { Badge } from '@platform/components/ui/badge'
import { Button } from '@platform/components/ui/button'
import { unitCollection } from '@platform/db/collections'
import { useLiveQuery } from '@tanstack/react-db'
import { Plus, Trash2 } from 'lucide-react'
import { UnitType } from 'prisma/generated/prisma/enums'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import MountManager from '@/lib/mount-manager'
import { CreateUnitSidebar } from './-components/create-unit-sidebar'
import { showUnitSidebar, UNIT_ASIDE_ID } from './-components/unit-sidebar'

export function UnitsPage() {
  const { data, isLoading } = useLiveQuery(q => q.from({ unit: unitCollection }))
  const [selectedId, setSelectedId] = useState<string>('')

  const handleAdd = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    setSelectedId('')
    showUnitSidebar(<CreateUnitSidebar />)
  }

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
              <Badge className='text-[9px] uppercase font-bold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/10'>Base Unit</Badge>
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

        h.display({
          id: 'actions',
          maxSize: 60,
          header: () => <div className='text-right pr-4'>Actions</div>,
          cell: ({ row }) => {
            const handleDelete = () => {
              MountManager.show(WarningPrompt, {
                title: 'Delete Unit',
                description: `Delete "${row.original.name}"? Products using this unit may be affected.`,
                onConfirm: async () => {
                  try {
                    unitCollection.update(row.original.id, draft => {
                      draft.deletedAt = new Date()
                    })
                    toast.success('Unit deleted')
                    return true
                  } catch {
                    toast.error('Failed to delete unit')
                    return false
                  }
                },
              })
            }
            return (
              <div className='flex justify-end pr-2'>
                <Button
                  variant='ghost'
                  size='icon'
                  className='rounded-full text-destructive hover:text-destructive hover:bg-destructive/10'
                  onClick={e => {
                    e.stopPropagation()
                    handleDelete()
                  }}
                >
                  <Trash2 className='size-4' />
                </Button>
              </div>
            )
          },
        }),
      ]),
    [],
  )

  return (
    <div className='w-full h-screen bg-background flex overflow-hidden relative min-h-0 flex-1'>
      <div className='flex-1 min-w-0 h-full px-4 flex flex-col overflow-hidden transition-all duration-300 ease-in-out bg-background/50 space-y-2'>
        <MultiView<NonNullable<typeof data>[number]>
          label='Units of Measure'
          description='Configure base scales and conversion matrices for accurate kitchen/retail yield calculations.'
          data={data}
          isFetching={isLoading}
          creatable={{
            label: 'Add Unit',
            href: '#',
            onAdd: handleAdd,
          }}
          views={{ list: [{ type: 'table', columns }] }}
        />
      </div>

      <MountManager id={UNIT_ASIDE_ID} />
    </div>
  )
}
