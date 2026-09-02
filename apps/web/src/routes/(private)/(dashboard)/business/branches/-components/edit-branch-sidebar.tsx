import { Badge } from '@platform/components/ui/badge'
import { Button } from '@platform/components/ui/button'
import { Input } from '@platform/components/ui/input'
import { Label } from '@platform/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@platform/components/ui/select'
import { Separator } from '@platform/components/ui/separator'
import { branchCollection } from '@platform/db/collections'
import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { fetchBranchUsers } from '@/lib/server-fn/fetch-branch-users'
import { updateBranch } from '@/lib/server-fn/update-branch'
import { updateOfflineTerminal } from '@/lib/server-fn/update-offline-terminal'
import { closeBranchSidebar } from './branch-sidebar'

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

type EditFormState = {
  name: string
  address: string
  country: string
  offlineTerminalId: string | null
  branchUsers: Array<{ id: string; name: string | null; email: string; role: string }>
  loadingUsers: boolean
}

export function EditBranchSidebar({ branch }: { branch: BranchRow }) {
  const [form, setForm] = useState<EditFormState>({
    name: '',
    address: '',
    country: 'PH',
    offlineTerminalId: null,
    branchUsers: [],
    loadingUsers: false,
  })
  const [saving, setSaving] = useState(false)

  // Load branch data + users when component mounts
  useEffect(() => {
    if (branch) {
      setForm(prev => ({
        ...prev,
        name: branch.name,
        address: branch.address ?? '',
        country: branch.country ?? 'PH',
        loadingUsers: true,
      }))

      // Fetch branch users
      fetchBranchUsers({ data: { branchId: branch.id } }).then(usersResult => {
        setForm(prev => ({
          ...prev,
          branchUsers: usersResult.success ? usersResult.users : [],
          loadingUsers: false,
          offlineTerminalId: branchCollection.get(branch.id)?.offlineTerminalId ?? null,
        }))
      })
    }
  }, [branch])

  const handleSave = async () => {
    if (!branch || !form.name.trim()) return
    setSaving(true)
    try {
      const [detailsResult, offlineResult] = await Promise.all([
        updateBranch({ data: { branchId: branch.id, name: form.name, address: form.address || undefined, country: form.country } }),
        updateOfflineTerminal({ data: { branchId: branch.id, offlineTerminalId: form.offlineTerminalId } }),
      ])

      if (!detailsResult.success) {
        toast.error(detailsResult.error ?? 'Failed to update branch')
        return
      }
      if (!offlineResult.success) {
        toast.error(offlineResult.error ?? 'Failed to update offline terminal designation')
        return
      }

      toast.success('Branch updated')
      closeBranchSidebar()
    } catch {
      toast.error('Failed to update branch')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='flex h-full flex-col'>
      {/* Header */}
      <div className='flex items-start justify-between p-4 border-b shrink-0'>
        <div>
          <h2 className='text-base font-semibold leading-tight'>Edit Branch</h2>
          <p className='text-xs text-muted-foreground mt-1'>Update branch details and configuration.</p>
        </div>
        <Button variant='ghost' size='icon' onClick={closeBranchSidebar} className='h-7 w-7 shrink-0'>
          <X className='size-4' />
        </Button>
      </div>

      {/* Content */}
      <div className='flex-1 overflow-y-auto p-4'>
        <div className='space-y-6'>
          {/* Branch details */}
          <div className='space-y-4'>
            <div className='space-y-2'>
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

            <div className='space-y-2'>
              <Label htmlFor='edit-branch-address'>Address</Label>
              <Input
                id='edit-branch-address'
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder='e.g. 123 Main St, Manila'
              />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='edit-branch-country'>Country Code</Label>
              <Input
                id='edit-branch-country'
                value={form.country}
                onChange={e => setForm(f => ({ ...f, country: e.target.value.toUpperCase().slice(0, 2) }))}
                placeholder='PH'
                maxLength={2}
                className='uppercase w-32'
              />
            </div>
          </div>

          <Separator />

          {/* Offline Terminal Designation */}
          <div className='space-y-4'>
            <div className='space-y-1'>
              <p className='text-sm font-medium'>Offline Checkout</p>
              <p className='text-xs text-muted-foreground'>
                Designate which user can process checkouts when offline. This prevents sequence number collisions when multiple devices lose connection.
              </p>
            </div>

            <div className='space-y-2'>
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
        </div>
      </div>

      {/* Footer */}
      <div className='p-4 border-t shrink-0 flex gap-3 justify-end'>
        <Button variant='outline' onClick={closeBranchSidebar} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!form.name.trim() || saving || form.loadingUsers}>
          Save Changes
        </Button>
      </div>
    </div>
  )
}
