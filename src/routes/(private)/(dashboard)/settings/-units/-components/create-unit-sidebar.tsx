import { Plus, X } from 'lucide-react'
import { UnitType } from 'prisma/generated/prisma/enums'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@startpos-core/components/ui/button'
import { Input } from '@startpos-core/components/ui/input'
import { Label } from '@startpos-core/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@startpos-core/components/ui/select'
import { Switch } from '@startpos-core/components/ui/switch'
import { unitCollection } from '@startpos-core/db/collections'
import { authStore } from '@startpos-core/lib/better-auth/auth-store'
import { closeUnitSidebar } from './unit-sidebar'

const defaultForm: { name: string; abbreviation: string; type: UnitType; conversionFactor: number; isBaseUnit: boolean } = {
  name: '',
  abbreviation: '',
  type: UnitType.COUNT,
  conversionFactor: 1,
  isBaseUnit: false,
}

export function CreateUnitSidebar() {
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
      closeUnitSidebar()
    } catch {
      toast.error('Failed to create unit')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    setForm(defaultForm)
    closeUnitSidebar()
  }

  return (
    <div className='flex h-full flex-col'>
      {/* Header */}
      <div className='flex items-start justify-between p-4 border-b shrink-0'>
        <div>
          <h2 className='text-base font-semibold leading-tight'>New Unit</h2>
          <p className='text-xs text-muted-foreground mt-1'>Configure base scales and conversion matrices for accurate kitchen/retail yield calculations.</p>
        </div>
        <Button variant='ghost' size='icon' onClick={handleClose} className='h-7 w-7 shrink-0'>
          <X className='size-4' />
        </Button>
      </div>

      {/* Content */}
      <div className='flex-1 overflow-y-auto p-4'>
        <div className='space-y-4'>
          <div className='grid grid-cols-2 gap-4'>
            <div className='space-y-2'>
              <Label htmlFor='unit-name'>Name</Label>
              <Input id='unit-name' value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder='e.g. Kilogram' autoFocus />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='unit-abbr'>Abbreviation</Label>
              <Input id='unit-abbr' value={form.abbreviation} onChange={e => setForm(f => ({ ...f, abbreviation: e.target.value }))} placeholder='e.g. kg' />
            </div>
          </div>

          <div className='space-y-2'>
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
            <p className='text-xs text-muted-foreground'>Select the type of measurement this unit represents.</p>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='unit-factor'>Conversion Factor</Label>
            <Input
              id='unit-factor'
              type='number'
              step='any'
              value={form.conversionFactor}
              onChange={e => setForm(f => ({ ...f, conversionFactor: Number(e.target.value) }))}
              placeholder='1'
            />
            <p className='text-xs text-muted-foreground'>How many of this unit equals one base unit (e.g., 1000g = 1kg).</p>
          </div>

          <div className='flex items-center justify-between rounded-lg border border-border p-4'>
            <div className='space-y-0.5'>
              <Label htmlFor='unit-base' className='text-base'>
                Is Base Unit
              </Label>
              <p className='text-sm text-muted-foreground'>Mark this as the fundamental unit for this measurement type.</p>
            </div>
            <Switch id='unit-base' checked={form.isBaseUnit} onCheckedChange={v => setForm(f => ({ ...f, isBaseUnit: v }))} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className='p-4 border-t shrink-0 flex gap-3 justify-end'>
        <Button variant='outline' onClick={handleClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleCreate} disabled={!form.name.trim() || !form.abbreviation.trim() || saving}>
          <Plus className='size-4' /> Add Unit
        </Button>
      </div>
    </div>
  )
}
