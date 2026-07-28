import { useLiveQuery } from '@tanstack/react-db'
import { Plus, Trash2 } from 'lucide-react'
import { UnitType } from 'prisma/generated/prisma/enums'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { getColumns } from '@/components/custom/data-view'
import { MultiView } from '@/components/custom/data-view/multi-view'
import { WarningPrompt } from '@/components/custom/prompt/warning-prompt'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { unitCollection } from '@/db/collections'
import MountManager from '@/lib/mount-manager'
import { authStore } from '@/store/auth-store'

const defaultForm: { name: string; abbreviation: string; type: UnitType; conversionFactor: number; isBaseUnit: boolean } = {
  name: '',
  abbreviation: '',
  type: UnitType.COUNT,
  conversionFactor: 1,
  isBaseUnit: false,
}

export function UnitsPage() {
  const { data, isLoading } = useLiveQuery(q => q.from({ unit: unitCollection }))
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    if (!form.name.trim() || !form.abbreviation.trim()) return
    setSaving(true)
    try {
      const { user } = authStore.state
      unitCollection.insert({
        id: crypto.randomUUID(),
        name: form.name.trim(),
        abbreviation: form.abbreviation.trim(),
        type: form.type,
        conversionFactor: Number(form.conversionFactor) || 1,
        isBaseUnit: form.isBaseUnit,
        businessId: user.business.id,
        updatedAt: new Date(),
        createdAt: new Date(),
        deletedAt: null,
      })
      toast.success(`Unit "${form.name.trim()}" created`)
      setForm(defaultForm)
      setOpen(false)
    } catch {
      toast.error('Failed to create unit')
    } finally {
      setSaving(false)
    }
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
    <>
      <div className='px-4 grow flex flex-col gap-2'>
        <MultiView<NonNullable<typeof data>[number]>
          label='Units of Measure'
          description='Configure base scales and conversion matrices for accurate kitchen/retail yield calculations.'
          data={data}
          isFetching={isLoading}
          creatable={{
            label: 'Add Unit',
            href: '#',
            onAdd: e => {
              e.preventDefault()
              setOpen(true)
            },
          }}
          views={{ list: [{ type: 'table', columns }] }}
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='sm:max-w-sm'>
          <DialogHeader>
            <DialogTitle>New Unit</DialogTitle>
          </DialogHeader>
          <div className='space-y-3 py-2'>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1.5'>
                <Label htmlFor='unit-name'>Name</Label>
                <Input id='unit-name' value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder='e.g. Kilogram' autoFocus />
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='unit-abbr'>Abbreviation</Label>
                <Input id='unit-abbr' value={form.abbreviation} onChange={e => setForm(f => ({ ...f, abbreviation: e.target.value }))} placeholder='e.g. kg' />
              </div>
            </div>

            <div className='space-y-1.5'>
              <Label>Measurement Type</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as UnitType }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(UnitType).map(t => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='unit-factor'>Conversion Factor</Label>
              <Input
                id='unit-factor'
                type='number'
                step='any'
                value={form.conversionFactor}
                onChange={e => setForm(f => ({ ...f, conversionFactor: Number(e.target.value) }))}
                placeholder='1'
              />
            </div>

            <div className='flex items-center justify-between'>
              <Label htmlFor='unit-base'>Is Base Unit</Label>
              <Switch id='unit-base' checked={form.isBaseUnit} onCheckedChange={v => setForm(f => ({ ...f, isBaseUnit: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => {
                setOpen(false)
                setForm(defaultForm)
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!form.name.trim() || !form.abbreviation.trim() || saving}>
              <Plus className='size-4' /> Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
