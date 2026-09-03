import { getColumns } from '@platform/components/custom/data-view'
import { MultiView } from '@platform/components/custom/data-view/multi-view'
import { WarningPrompt } from '@platform/components/custom/prompt/warning-prompt'
import { Button } from '@platform/components/ui/button'
import { categoryCollection } from '@platform/db/collections'
import { useLiveQuery } from '@tanstack/react-db'
import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import MountManager from '@platform/lib/mount-manager'
import { CATEGORY_ASIDE_ID, showCategorySidebar } from './-components/category-sidebar'
import { CreateCategorySidebar } from './-components/create-category-sidebar'

export function CategoriesPage() {
  const { data, isLoading } = useLiveQuery(q => q.from({ category: categoryCollection }))
  const [selectedId, setSelectedId] = useState<string>('')

  const handleAdd = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    setSelectedId('')
    showCategorySidebar(<CreateCategorySidebar />)
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
    <div className='w-full h-screen bg-background flex overflow-hidden relative min-h-0 flex-1'>
      <div className='flex-1 min-w-0 h-full px-4 flex flex-col overflow-hidden transition-all duration-300 ease-in-out bg-background/50 space-y-2'>
        <MultiView<NonNullable<typeof data>[number]>
          label='Product Categories'
          description='Organize your menu offerings, inventory items, and modifiers for streamlined POS navigation.'
          data={data}
          isFetching={isLoading}
          creatable={{
            label: 'Add Category',
            href: '#',
            onAdd: handleAdd,
          }}
          views={{ list: [{ type: 'table', columns }] }}
        />
      </div>

      <MountManager id={CATEGORY_ASIDE_ID} />
    </div>
  )
}
