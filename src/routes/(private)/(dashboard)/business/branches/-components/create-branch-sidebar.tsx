import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@startpos-core/components/ui/button'
import { Input } from '@startpos-core/components/ui/input'
import { Label } from '@startpos-core/components/ui/label'
import { createBranch } from '@/lib/server-fn/create-branch'
import { closeBranchSidebar } from './branch-sidebar'

const defaultCreateForm = { name: '', address: '', country: 'PH' }

export function CreateBranchSidebar() {
  const [form, setForm] = useState(defaultCreateForm)
  const [saving, setSaving] = useState(false)

  const reset = () => setForm(defaultCreateForm)

  const handleCreate = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const result = await createBranch({ data: { name: form.name, address: form.address || undefined, country: form.country } })
      if (!result.success) {
        toast.error(result.error ?? 'Failed to create branch')
        return
      }
      toast.success(`Branch "${result.branch.name}" created`)
      reset()
      closeBranchSidebar()
    } catch {
      toast.error('Failed to create branch')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    reset()
    closeBranchSidebar()
  }

  return (
    <div className='flex h-full flex-col'>
      {/* Header */}
      <div className='flex items-start justify-between p-4 border-b shrink-0'>
        <div>
          <h2 className='text-base font-semibold leading-tight'>New Branch</h2>
          <p className='text-xs text-muted-foreground mt-1'>Add a new branch location to your business.</p>
        </div>
        <Button variant='ghost' size='icon' onClick={handleClose} className='h-7 w-7 shrink-0'>
          <X className='size-4' />
        </Button>
      </div>

      {/* Content */}
      <div className='flex-1 overflow-y-auto p-4'>
        <div className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='branch-name'>
              Branch Name <span className='text-destructive'>*</span>
            </Label>
            <Input
              id='branch-name'
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder='e.g. Downtown Branch'
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreate()
              }}
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='branch-address'>Address</Label>
            <Input
              id='branch-address'
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              placeholder='e.g. 123 Main St, Manila'
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='branch-country'>Country Code</Label>
            <Input
              id='branch-country'
              value={form.country}
              onChange={e => setForm(f => ({ ...f, country: e.target.value.toUpperCase().slice(0, 2) }))}
              placeholder='PH'
              maxLength={2}
              className='uppercase w-32'
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className='p-4 border-t shrink-0 flex gap-3 justify-end'>
        <Button variant='outline' onClick={handleClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleCreate} disabled={!form.name.trim() || saving}>
          <Plus className='size-4' /> Create Branch
        </Button>
      </div>
    </div>
  )
}
