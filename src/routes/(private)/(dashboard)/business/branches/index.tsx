/**
 * business/branches — Branch management page
 *
 * Features:
 *   - List all branches from branchCollection (eager-synced, reactive)
 *   - Create a new branch (name, address, country)
 *   - Edit a branch's details + offline terminal designation
 *   - Soft-delete a branch (via rootPrisma, triggers sync)
 *
 * Branch-level feature management has been moved to the capability system.
 * Features are controlled via BusinessCapabilityState instead of BusinessConfiguration.
 *
 * Gated by MANAGE_BRANCHES capability (handled by parent /business route).
 */

import { useLiveQuery } from '@tanstack/react-db'
import { createFileRoute } from '@tanstack/react-router'
import { Building2, MapPin } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { getColumns } from '@/components/custom/data-view'
import { MultiView } from '@/components/custom/data-view/multi-view'
import { WarningPrompt } from '@/components/custom/prompt/warning-prompt'
import { RequireAccess } from '@/components/require-access'
import { Badge } from '@/components/ui/badge'
import { branchCollection } from '@/db/collections'
import { Permissions } from '@/lib/authorization/permission-keys'
import { Capabilities } from '@/lib/entitlement/capability-keys'
import MountManager from '@/lib/mount-manager'
import { authStore } from '@/store/auth-store'
import { BRANCH_ASIDE_ID, showBranchSidebar } from './-components/branch-sidebar'
import { CreateBranchSidebar } from './-components/create-branch-sidebar'
import { EditBranchSidebar } from './-components/edit-branch-sidebar'

export const Route = createFileRoute('/(private)/(dashboard)/business/branches/')({
  component: () => (
    <RequireAccess capability={Capabilities.MANAGE_BRANCHES} permission={Permissions.BUSINESS_VIEW_BRANCHES}>
      <BranchesPage />
    </RequireAccess>
  ),
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Branch row type derived from the live query result
type BranchRow = {
  id: string
  name: string
  address: string | null
  country: string
  branchCode: string
  serialNumber: string
  businessId: string
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
  minInvoiceNo: number
  maxInvoiceNo: number
}

// ---------------------------------------------------------------------------
// Default form states - removed, moved to sidebar components
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function BranchesPage() {
  const { data, isLoading } = useLiveQuery(q => q.from({ branch: branchCollection }))
  const { user } = authStore.state
  const [selectedId, setSelectedId] = useState<string>('')

  // Calculate branch usage and limits
  const activeBranches = data?.filter(b => !b.deletedAt) ?? []
  const currentBranchCount = activeBranches.length

  // Get branch limit from user entitlement
  const branchEntitlement = user?.entitlement?.planFeatures?.find(f => f === 'MANAGE_BRANCHES')
  const branchUsageLimit = user?.entitlement?.usageLimits?.MANAGE_BRANCHES
  const planBranchLimit = branchUsageLimit ?? (branchEntitlement ? -1 : 0) // -1 = unlimited, 0 = no access

  // Note: Add-on calculation would require a separate query, for now just show plan limits
  const atBranchLimit = planBranchLimit !== -1 && currentBranchCount >= planBranchLimit

  const getBranchLimitText = () => {
    if (planBranchLimit === -1) return 'Unlimited branches'
    if (planBranchLimit === 0) return 'No branch access'
    return `${currentBranchCount} of ${planBranchLimit} branches used`
  }

  const handleAdd = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    setSelectedId('')
    showBranchSidebar(<CreateBranchSidebar />)
  }

  const openEdit = useCallback((branch: BranchRow) => {
    setSelectedId(branch.id)
    showBranchSidebar(<EditBranchSidebar branch={branch} />)
  }, [])

  const handleDelete = useCallback(
    (branch: BranchRow) => {
      // Prevent deleting the only branch
      const activeBranches = data?.filter(b => !b.deletedAt) ?? []
      if (activeBranches.length <= 1) {
        toast.error('You must have at least one branch. Create a new branch before deleting this one.')
        return
      }

      // Prevent deleting the currently active branch
      if (branch.id === user.branch.id) {
        toast.error("You can't delete the branch you're currently signed into.")
        return
      }

      MountManager.show(WarningPrompt, {
        title: 'Delete Branch',
        description: `Delete "${branch.name}"? All data associated with this branch (transactions, inventory, etc.) will remain but the branch will be deactivated.`,
        btnText: 'Delete',
        onConfirm: async () => {
          try {
            // Soft-delete: update deletedAt via branchCollection
            // Branch uses the same soft-delete pattern as other collections
            branchCollection.update(branch.id, draft => {
              draft.deletedAt = new Date()
            })
            toast.success(`Branch "${branch.name}" deleted`)
            return true
          } catch {
            toast.error('Failed to delete branch')
            return false
          }
        },
      })
    },
    [data, user.branch.id],
  )

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
          header: 'Branch Name',
          cell: info => {
            const branch = info.row.original
            const isCurrent = branch.id === user.branch.id
            return (
              <div className='flex items-center gap-2'>
                <Building2 className='size-3.5 text-muted-foreground shrink-0' />
                <span className='font-semibold text-foreground'>{info.getValue()}</span>
                {isCurrent && (
                  <Badge variant='secondary' className='text-[9px] uppercase font-bold h-4 px-1.5 bg-primary/10 text-primary border border-primary/20'>
                    Current
                  </Badge>
                )}
              </div>
            )
          },
        }),

        h.accessor('address', {
          header: 'Address',
          cell: info => {
            const val = info.getValue()
            return val ? (
              <span className='flex items-center gap-1 text-xs text-muted-foreground'>
                <MapPin className='size-3 shrink-0' />
                {val}
              </span>
            ) : (
              <span className='text-xs text-muted-foreground/40'>—</span>
            )
          },
        }),

        h.accessor('branchCode', {
          header: 'Code',
          cell: info => <span className='font-mono text-xs bg-muted px-1.5 py-0.5 rounded tracking-wider text-foreground'>{info.getValue()}</span>,
        }),

        h.accessor('country', {
          header: 'Country',
          cell: info => (
            <Badge variant='outline' className='text-[10px] uppercase font-bold py-0 h-5 text-muted-foreground'>
              {info.getValue()}
            </Badge>
          ),
        }),
      ]),
    [user.branch.id, handleDelete],
  )

  return (
    <div className='w-full h-screen bg-background flex overflow-hidden relative min-h-0 flex-1'>
      <div className='flex-1 min-w-0 h-full px-4 flex flex-col overflow-hidden transition-all duration-300 ease-in-out bg-background/50 space-y-2'>
        <MultiView<NonNullable<typeof data>[number]>
          label='Branches'
          description={
            <div className='space-y-1'>
              <div>Manage your business locations. Each branch can independently enable or disable features without affecting other branches.</div>
              <div className='text-xs text-muted-foreground'>{getBranchLimitText()}</div>
            </div>
          }
          data={data}
          isFetching={isLoading}
          creatable={
            atBranchLimit
              ? undefined
              : {
                  label: 'Add Branch',
                  href: '#',
                  onAdd: handleAdd,
                }
          }
          views={{ list: [{ type: 'table', columns, selectableRow: { onClick: openEdit, isSelected: (b: BranchRow) => b.id === selectedId } }] }}
        />

        {atBranchLimit && (
          <div className='rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3'>
            <div className='text-sm text-amber-800 dark:text-amber-200'>
              <div className='font-medium'>Branch limit reached</div>
              <div className='mt-1'>
                Your current plan allows {planBranchLimit} branch{planBranchLimit === 1 ? '' : 'es'}. Upgrade your plan or purchase branch add-ons to add more
                locations.
              </div>
            </div>
          </div>
        )}
      </div>

      <MountManager id={BRANCH_ASIDE_ID} />
    </div>
  )
}
