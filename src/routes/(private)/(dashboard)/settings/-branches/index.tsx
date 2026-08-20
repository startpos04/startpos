/**
 * settings/branches — Branch management page
 *
 * Features:
 *   - List all branches from branchCollection (eager-synced, reactive)
 *   - Create a new branch (name, address, country)
 *   - Edit a branch's details + per-branch feature toggles
 *   - Soft-delete a branch (via rootPrisma, triggers sync)
 *
 * Feature toggles map branch-scoped SystemConfig ENABLE_* keys to the
 * capabilities controlled in EntitlementEngine Step 2.5.
 *
 * Gated by MANAGE_BRANCHES capability — the settings/index.tsx wrapper
 * wraps this in <RequireCapability cap={Capabilities.MANAGE_BRANCHES} />.
 */

import { useLiveQuery } from '@tanstack/react-db'
import { Building2, Edit2, MapPin, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { branchCollection } from '@/db/collections'
import MountManager from '@/lib/mount-manager'
import { createBranch } from '@/lib/server-fn/create-branch'
import { fetchBranchUsers } from '@/lib/server-fn/fetch-branch-users'
import { updateBranch } from '@/lib/server-fn/update-branch'
import { BRANCH_TOGGLE_DEFAULTS, type BranchToggleConfig, fetchBranchConfig, updateBranchConfig } from '@/lib/server-fn/update-branch-config'
import { updateOfflineTerminal } from '@/lib/server-fn/update-offline-terminal'
import { authStore } from '@/store/auth-store'

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
// Default form states
// ---------------------------------------------------------------------------

const defaultCreateForm = { name: '', address: '', country: 'PH' }

type EditFormState = {
  name: string
  address: string
  country: string
  toggles: BranchToggleConfig
  loadingToggles: boolean
  offlineTerminalId: string | null
  branchUsers: Array<{ id: string; name: string | null; email: string; role: string }>
  loadingUsers: boolean
}

// ---------------------------------------------------------------------------
// Toggle descriptors — label + description shown in the edit dialog
// ---------------------------------------------------------------------------

const TOGGLE_DESCRIPTORS: { key: keyof BranchToggleConfig; label: string; description: string }[] = [
  {
    key: 'ENABLE_ORDER',
    label: 'Orders',
    description: 'Allow staff to create and edit customer orders at this branch.',
  },
  {
    key: 'ENABLE_ORDER_TAB',
    label: 'Order Tab',
    description: 'Enable the tab-based order view in the POS for deferred payment workflows.',
  },
  {
    key: 'ENABLE_TASK',
    label: 'Operational Tasks',
    description: 'Allow creating and managing operational tasks (stock checks, shelf refills, etc.).',
  },
  {
    key: 'ENABLE_CASH_RECONCILIATION',
    label: 'Cash Reconciliation',
    description: 'Enable vendor sessions and end-of-day cash reconciliation at this branch.',
  },
  {
    key: 'ENABLE_PRINT_RECEIPT',
    label: 'Print Receipt',
    description: 'Allow printing physical receipts after checkout at this branch.',
  },
]

// ---------------------------------------------------------------------------
// Create dialog
// ---------------------------------------------------------------------------

function CreateBranchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
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
      onOpenChange(false)
    } catch {
      toast.error('Failed to create branch')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        onOpenChange(v)
        if (!v) reset()
      }}
    >
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader>
          <DialogTitle>New Branch</DialogTitle>
        </DialogHeader>

        <div className='space-y-3 py-2'>
          <div className='space-y-1.5'>
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

          <div className='space-y-1.5'>
            <Label htmlFor='branch-address'>Address</Label>
            <Input
              id='branch-address'
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              placeholder='e.g. 123 Main St, Manila'
            />
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='branch-country'>Country Code</Label>
            <Input
              id='branch-country'
              value={form.country}
              onChange={e => setForm(f => ({ ...f, country: e.target.value.toUpperCase().slice(0, 2) }))}
              placeholder='PH'
              maxLength={2}
              className='uppercase w-20'
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => {
              onOpenChange(false)
              reset()
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!form.name.trim() || saving}>
            <Plus className='size-4' /> Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Edit dialog (branch details + feature toggles)
// ---------------------------------------------------------------------------

function EditBranchDialog({ branch, open, onOpenChange }: { branch: BranchRow | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [form, setForm] = useState<EditFormState>({
    name: '',
    address: '',
    country: 'PH',
    toggles: { ...BRANCH_TOGGLE_DEFAULTS },
    loadingToggles: false,
    offlineTerminalId: null,
    branchUsers: [],
    loadingUsers: false,
  })
  const [saving, setSaving] = useState(false)

  // Load branch data + toggles + users when dialog opens
  useEffect(() => {
    if (open && branch) {
      setForm(prev => ({
        ...prev,
        name: branch.name,
        address: branch.address ?? '',
        country: branch.country ?? 'PH',
        toggles: { ...BRANCH_TOGGLE_DEFAULTS },
        loadingToggles: true,
        loadingUsers: true,
      }))

      // Fetch branch config and users in parallel
      Promise.all([
        fetchBranchConfig({ data: { branchId: branch.id } }),
        fetchBranchUsers({ data: { branchId: branch.id } }),
        // Fetch the current branch data to get offlineTerminalId
        fetch(`/api/branch/${branch.id}`).catch(() => null),
      ]).then(([configResult, usersResult]) => {
        setForm(prev => ({
          ...prev,
          toggles: configResult.success ? configResult.config : { ...BRANCH_TOGGLE_DEFAULTS },
          loadingToggles: false,
          branchUsers: usersResult.success ? usersResult.users : [],
          loadingUsers: false,
          // offlineTerminalId will be loaded from branchCollection
          offlineTerminalId: branchCollection.get(branch.id)?.offlineTerminalId ?? null,
        }))
      })
    }
  }, [open, branch])

  const handleSave = async () => {
    if (!branch || !form.name.trim()) return
    setSaving(true)
    try {
      const [detailsResult, configResult, offlineResult] = await Promise.all([
        updateBranch({ data: { branchId: branch.id, name: form.name, address: form.address || undefined, country: form.country } }),
        updateBranchConfig({ data: { branchId: branch.id, config: form.toggles } }),
        updateOfflineTerminal({ data: { branchId: branch.id, offlineTerminalId: form.offlineTerminalId } }),
      ])

      if (!detailsResult.success) {
        toast.error(detailsResult.error ?? 'Failed to update branch')
        return
      }
      if (!configResult.success) {
        toast.error(configResult.error ?? 'Failed to save feature toggles')
        return
      }
      if (!offlineResult.success) {
        toast.error(offlineResult.error ?? 'Failed to update offline terminal designation')
        return
      }

      toast.success('Branch updated')
      onOpenChange(false)
    } catch {
      toast.error('Failed to update branch')
    } finally {
      setSaving(false)
    }
  }

  const setToggle = (key: keyof BranchToggleConfig, value: boolean) => {
    setForm(f => ({ ...f, toggles: { ...f.toggles, [key]: value } }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Edit Branch</DialogTitle>
        </DialogHeader>

        <div className='space-y-4 py-2'>
          {/* Branch details */}
          <div className='space-y-3'>
            <div className='space-y-1.5'>
              <Label htmlFor='edit-branch-name'>
                Branch Name <span className='text-destructive'>*</span>
              </Label>
              <Input
                id='edit-branch-name'
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder='e.g. Downtown Branch'
                autoFocus
              />
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='edit-branch-address'>Address</Label>
              <Input
                id='edit-branch-address'
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder='e.g. 123 Main St, Manila'
              />
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='edit-branch-country'>Country Code</Label>
              <Input
                id='edit-branch-country'
                value={form.country}
                onChange={e => setForm(f => ({ ...f, country: e.target.value.toUpperCase().slice(0, 2) }))}
                placeholder='PH'
                maxLength={2}
                className='uppercase w-20'
              />
            </div>
          </div>

          <Separator />

          {/* Offline Terminal Designation */}
          <div className='space-y-3'>
            <div className='space-y-1'>
              <p className='text-sm font-medium'>Offline Checkout</p>
              <p className='text-xs text-muted-foreground'>
                Designate which user can process checkouts when offline. This prevents sequence number collisions when multiple devices lose connection.
              </p>
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='offline-terminal'>Offline Terminal User</Label>
              <Select
                value={form.offlineTerminalId ?? 'none'}
                onValueChange={v => setForm(f => ({ ...f, offlineTerminalId: v === 'none' ? null : v }))}
                disabled={form.loadingUsers || saving}
              >
                <SelectTrigger id='offline-terminal'>
                  <SelectValue placeholder='Select a user...' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='none'>
                    <span className='text-muted-foreground italic'>None (offline checkout disabled)</span>
                  </SelectItem>
                  {form.branchUsers.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      <div className='flex items-center gap-2'>
                        <span>{user.name ?? user.email}</span>
                        <Badge variant='outline' className='text-[9px] uppercase'>
                          {user.role}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className='text-xs text-muted-foreground'>
                Only this user will be able to create transactions while offline. Set to "None" to block all offline checkouts.
              </p>
            </div>
          </div>

          <Separator />

          {/* Feature toggles */}
          <div className='space-y-1'>
            <p className='text-sm font-medium'>Feature Toggles</p>
            <p className='text-xs text-muted-foreground'>Disable features at this branch without affecting other branches or your plan.</p>
          </div>

          <div className='space-y-3'>
            {TOGGLE_DESCRIPTORS.map(({ key, label, description }) => (
              <div key={key} className='flex items-start justify-between gap-4'>
                <div className='flex-1 min-w-0'>
                  <p className='text-sm font-medium leading-none'>{label}</p>
                  <p className='text-xs text-muted-foreground mt-0.5'>{description}</p>
                </div>
                <Switch
                  checked={form.loadingToggles ? false : form.toggles[key]}
                  onCheckedChange={v => setToggle(key, v)}
                  disabled={form.loadingToggles || saving}
                  aria-label={`Toggle ${label}`}
                />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!form.name.trim() || saving || form.loadingToggles || form.loadingUsers}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function BranchesPage() {
  const { data, isLoading } = useLiveQuery(q => q.from({ branch: branchCollection }))
  const { user } = authStore.state

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<BranchRow | null>(null)
  const [editOpen, setEditOpen] = useState(false)

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

  const openEdit = (branch: BranchRow) => {
    setEditTarget(branch)
    setEditOpen(true)
  }

  const handleDelete = (branch: BranchRow) => {
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

        h.display({
          id: 'actions',
          maxSize: 80,
          header: () => <div className='text-right pr-4'>Actions</div>,
          cell: ({ row }) => (
            <div className='flex justify-end gap-1 pr-2'>
              <Button
                variant='ghost'
                size='icon'
                className='rounded-full size-8'
                onClick={e => {
                  e.stopPropagation()
                  openEdit(row.original)
                }}
                aria-label='Edit branch'
              >
                <Edit2 className='size-3.5' />
              </Button>
              <Button
                variant='ghost'
                size='icon'
                className='rounded-full size-8 text-destructive hover:text-destructive hover:bg-destructive/10'
                onClick={e => {
                  e.stopPropagation()
                  handleDelete(row.original)
                }}
                aria-label='Delete branch'
              >
                <Trash2 className='size-4' />
              </Button>
            </div>
          ),
        }),
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, user.branch.id],
  )

  return (
    <>
      <div className='px-4 grow flex flex-col gap-2'>
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
                  onAdd: e => {
                    e.preventDefault()
                    setCreateOpen(true)
                  },
                }
          }
          views={{ list: [{ type: 'table', columns }] }}
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

      <CreateBranchDialog open={createOpen} onOpenChange={setCreateOpen} />

      <EditBranchDialog branch={editTarget} open={editOpen} onOpenChange={setEditOpen} />
    </>
  )
}
