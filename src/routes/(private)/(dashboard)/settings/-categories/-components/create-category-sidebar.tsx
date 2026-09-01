import { Plus, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@startpos-core/components/ui/button'
import { Input } from '@startpos-core/components/ui/input'
import { Label } from '@startpos-core/components/ui/label'
import { categoryCollection } from '@startpos-core/db/collections'
import { authStore } from '@startpos-core/lib/better-auth/auth-store'
import { closeCategorySidebar } from './category-sidebar'

export function CreateCategorySidebar() {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const { user } = authStore.state
      categoryCollection.insert({
        id: crypto.randomUUID(),
        name: trimmed,
        businessId: user.business.id,
        updatedAt: new Date(),
        createdAt: new Date(),
        deletedAt: null,
      })
      toast.success(`Category "${trimmed}" created`)
      setName('')
      closeCategorySidebar()
    } catch {
      toast.error('Failed to create category')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='flex h-full flex-col'>
      {/* Header */}
      <div className='flex items-start justify-between p-4 border-b shrink-0'>
        <div>
          <h2 className='text-base font-semibold leading-tight'>New Category</h2>
          <p className='text-xs text-muted-foreground mt-1'>Organize your menu offerings, inventory items, and modifiers.</p>
        </div>
        <Button variant='ghost' size='icon' onClick={closeCategorySidebar} className='h-7 w-7 shrink-0'>
          <X className='size-4' />
        </Button>
      </div>

      {/* Content */}
      <div className='flex-1 overflow-y-auto p-4'>
        <div className='space-y-2'>
          <Label htmlFor='cat-name'>Category Name</Label>
          <Input
            id='cat-name'
            ref={inputRef}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder='e.g. Beverages'
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate()
            }}
          />
          <p className='text-xs text-muted-foreground'>This will help you organize products in your POS system.</p>
        </div>
      </div>

      {/* Footer */}
      <div className='p-4 border-t shrink-0 flex gap-3 justify-end'>
        <Button variant='outline' onClick={closeCategorySidebar} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleCreate} disabled={!name.trim() || saving}>
          <Plus className='size-4' /> Add Category
        </Button>
      </div>
    </div>
  )
}
