import { useLiveQuery } from '@tanstack/react-db'
import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { getColumns } from '@/components/custom/data-view'
import { MultiView } from '@/components/custom/data-view/multi-view'
import { WarningPrompt } from '@/components/custom/prompt/warning-prompt'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { categoryCollection } from '@/db/collections'
import MountManager from '@/lib/mount-manager'
import { authStore } from '@/store/auth-store'

export function CategoriesPage() {
  const { data, isLoading } = useLiveQuery(q => q.from({ category: categoryCollection }))
  const [open, setOpen] = useState(false)
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
      setOpen(false)
    } catch {
      toast.error('Failed to create category')
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
          header: 'Category Name',
          cell: info => <span className='font-semibold text-foreground'>{info.getValue()}</span>,
        }),

        h.display({
          id: 'actions',
          maxSize: 60,
          header: () => <div className='text-right pr-4'>Actions</div>,
          cell: ({ row }) => {
            const handleDelete = () => {
              MountManager.show(WarningPrompt, {
                title: 'Delete Category',
                description: `Delete "${row.original.name}"? Products using this category will become uncategorised.`,
                onConfirm: async () => {
                  try {
                    categoryCollection.update(row.original.id, draft => {
                      draft.deletedAt = new Date()
                    })
                    toast.success('Category deleted')
                    return true
                  } catch {
                    toast.error('Failed to delete category')
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
          label='Product Categories'
          description='Organize your menu offerings, inventory items, and modifiers for streamlined POS navigation.'
          data={data}
          isFetching={isLoading}
          creatable={{
            label: 'Add Category',
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
            <DialogTitle>New Category</DialogTitle>
          </DialogHeader>
          <div className='space-y-2 py-2'>
            <Label htmlFor='cat-name'>Name</Label>
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
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!name.trim() || saving}>
              <Plus className='size-4' /> Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
