// task-details-tab.tsx

import { SelectInput } from '@platform/components/custom/form/select-input'
import { Badge } from '@platform/components/ui/badge'
import { Button } from '@platform/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@platform/components/ui/card'
import { Input } from '@platform/components/ui/input'
import { operationalTaskCollection } from '@platform/db/collections'
import { withForm } from '@platform/hooks/form'
import dayjs from '@platform/lib/dayjs'
import { cn } from '@platform/lib/utils'
import { ArrowRightLeft, Banknote, BarChart3, Check, ClipboardList, FileText, Layers, ShieldCheck, ShoppingBag, Trash2 } from 'lucide-react'
import { TaskStatus, TaskType } from 'prisma/generated/prisma/enums'
import { useState } from 'react'
import type { feTask } from '@/lib/queries/fetch-tasks'
import { fetchUserOptions } from '@/lib/queries/fetch-user-options'
import { taskFormOpts } from '../../create/-create-task'
import { getTaskWorkflowRules } from './task-workflow'

interface TaskDetailsTabProps {
  task: feTask
}

// ---------------------------------------------------------------------------
// C2/C3: Three-Quantity Badge Strip
// Displays all three quantity stages together. Editable fields appear when
// the task is in the right lifecycle stage.
// ---------------------------------------------------------------------------

interface QuantityStripProps {
  task: feTask
}

function QuantityStrip({ task }: QuantityStripProps) {
  const { status, metadata } = task
  const suggestedQty = metadata?.suggestedQty
  const approvedQty = metadata?.approvedQty
  const verifiedQty = metadata?.verifiedQty

  // C3: approvedQty editable when task is PENDING (approver is reviewing)
  const canEditApproved = status === TaskStatus.PENDING
  // C4: verifiedQty editable when task is IN_PROGRESS (clerk is executing)
  const canEditVerified = status === TaskStatus.IN_PROGRESS

  const [draftApprovedQty, setDraftApprovedQty] = useState<string>(approvedQty != null ? String(approvedQty) : '')
  const [draftVerifiedQty, setDraftVerifiedQty] = useState<string>(verifiedQty != null ? String(verifiedQty) : '')
  const [savedApproved, setSavedApproved] = useState(false)
  const [savedVerified, setSavedVerified] = useState(false)

  const saveApprovedQty = () => {
    const parsed = Number(draftApprovedQty)
    if (Number.isNaN(parsed) || parsed < 0) return
    operationalTaskCollection.update(task.id, draft => {
      draft.metadata = { ...draft.metadata, approvedQty: parsed }
      draft.updatedAt = new Date()
    })
    setSavedApproved(true)
    setTimeout(() => setSavedApproved(false), 1500)
  }

  const saveVerifiedQty = () => {
    const parsed = Number(draftVerifiedQty)
    if (Number.isNaN(parsed) || parsed < 0) return
    operationalTaskCollection.update(task.id, draft => {
      draft.metadata = { ...draft.metadata, verifiedQty: parsed }
      draft.updatedAt = new Date()
    })
    setSavedVerified(true)
    setTimeout(() => setSavedVerified(false), 1500)
  }

  return (
    <div className='rounded-xl border bg-slate-50/60 p-4 space-y-3'>
      <div className='flex items-center gap-2 mb-1'>
        <Layers className='h-3.5 w-3.5 text-slate-500' />
        <span className='text-[0.65rem] uppercase font-bold text-slate-500 tracking-wide'>Three-Quantity Model</span>
      </div>

      <div className='grid grid-cols-3 gap-3'>
        {/* Stage 1 — Suggested (creator's estimate, always read-only here) */}
        <div className='space-y-1.5'>
          <div className='flex items-center gap-1.5'>
            <Badge variant='outline' className='text-[9px] py-0 h-4 text-blue-600 border-blue-200 bg-blue-50'>
              Suggested
            </Badge>
          </div>
          <p className='text-lg font-bold text-blue-700 tabular-nums'>{suggestedQty ?? '—'}</p>
          <p className='text-[10px] text-slate-400'>Creator estimate</p>
        </div>

        {/* Stage 2 — Approved (approver sets this; editable while PENDING) */}
        <div className='space-y-1.5'>
          <div className='flex items-center gap-1.5'>
            <Badge
              variant='outline'
              className={cn(
                'text-[9px] py-0 h-4',
                canEditApproved ? 'text-amber-600 border-amber-200 bg-amber-50 animate-pulse' : 'text-purple-600 border-purple-200 bg-purple-50',
              )}
            >
              {canEditApproved ? 'Set Approved ↗' : 'Approved'}
            </Badge>
          </div>
          {canEditApproved ? (
            <div className='flex items-center gap-1'>
              <Input
                type='number'
                min={0}
                value={draftApprovedQty}
                onChange={e => setDraftApprovedQty(e.target.value)}
                className='h-7 text-sm font-bold w-full tabular-nums'
                placeholder={String(suggestedQty ?? 0)}
              />
              <Button type='button' size='icon' variant={savedApproved ? 'default' : 'outline'} className='h-7 w-7 shrink-0' onClick={saveApprovedQty}>
                <Check className='h-3 w-3' />
              </Button>
            </div>
          ) : (
            <p className='text-lg font-bold text-purple-700 tabular-nums'>{approvedQty ?? '—'}</p>
          )}
          <p className='text-[10px] text-slate-400'>Manager approved</p>
        </div>

        {/* Stage 3 — Verified (clerk records actual; editable while IN_PROGRESS) */}
        <div className='space-y-1.5'>
          <div className='flex items-center gap-1.5'>
            <Badge
              variant='outline'
              className={cn(
                'text-[9px] py-0 h-4',
                canEditVerified ? 'text-emerald-600 border-emerald-200 bg-emerald-50 animate-pulse' : 'text-indigo-600 border-indigo-200 bg-indigo-50',
              )}
            >
              {canEditVerified ? 'Record Actual ↗' : 'Verified'}
            </Badge>
          </div>
          {canEditVerified ? (
            <div className='flex items-center gap-1'>
              <Input
                type='number'
                min={0}
                value={draftVerifiedQty}
                onChange={e => setDraftVerifiedQty(e.target.value)}
                className='h-7 text-sm font-bold w-full tabular-nums'
                placeholder={String(approvedQty ?? suggestedQty ?? 0)}
              />
              <Button type='button' size='icon' variant={savedVerified ? 'default' : 'outline'} className='h-7 w-7 shrink-0' onClick={saveVerifiedQty}>
                <Check className='h-3 w-3' />
              </Button>
            </div>
          ) : (
            <p className='text-lg font-bold text-indigo-700 tabular-nums'>{verifiedQty ?? '—'}</p>
          )}
          <p className='text-[10px] text-slate-400'>Clerk actual</p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Task-type detail sub-components
// These show the type-specific metadata fields. The quantity model is hoisted
// into the shared QuantityStrip above — these components focus on everything
// else (locations, branches, suppliers, etc.).
// ---------------------------------------------------------------------------

function ShelfRefillDetails({ task }: TaskDetailsTabProps) {
  if (!task) return null
  return (
    <div className='space-y-4'>
      <QuantityStrip task={task} />
      <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm'>
        <div>
          <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Refill Item (Variant)</p>
          <p className='font-medium font-mono text-xs'>{task.metadata?.variantId || '—'}</p>
        </div>
        <div>
          {/* suggestedQty also shown inline for quick scan */}
          <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Suggested Qty (quick)</p>
          <p className='font-semibold text-blue-600'>{task.metadata?.suggestedQty ?? '—'}</p>
        </div>
        <div>
          <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Source Location (From)</p>
          <p className='font-medium'>{task.metadata?.sourceLocationId || '—'}</p>
        </div>
        <div>
          <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Target Location (To)</p>
          <p className='font-medium'>{task.metadata?.targetLocationId || '—'}</p>
        </div>
      </div>
    </div>
  )
}

function PurchaseRequestDetails({ task }: TaskDetailsTabProps) {
  if (!task) return null
  return (
    <div className='space-y-4'>
      <QuantityStrip task={task} />
      <div className='grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm'>
        <div>
          <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Target Supplier</p>
          <p className='font-medium'>{task.metadata?.supplierId || '—'}</p>
        </div>
        <div>
          <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Item to Order</p>
          <p className='font-medium font-mono text-xs'>{task.metadata?.variantId || '—'}</p>
        </div>
        <div>
          <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Order Quantity</p>
          <p className='font-semibold text-amber-600'>{task.metadata?.suggestedQty ?? '—'}</p>
        </div>
      </div>
    </div>
  )
}

function BranchTransferDetails({ task }: TaskDetailsTabProps) {
  if (!task) return null
  return (
    <div className='space-y-4'>
      <QuantityStrip task={task} />
      <div className='grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm'>
        <div>
          <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Target Item (Variant)</p>
          <p className='font-medium font-mono text-xs'>{task.metadata?.variantId || '—'}</p>
        </div>
        <div>
          <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Transfer Quantity</p>
          <p className='font-semibold text-blue-600'>{task.metadata?.suggestedQty ?? '—'}</p>
        </div>
        <div>
          <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Destination Branch</p>
          <p className='font-medium'>{task.metadata?.targetBranchId || '—'}</p>
        </div>
      </div>
    </div>
  )
}

function StockCountDetails({ task }: TaskDetailsTabProps) {
  if (!task) return null
  return (
    <div className='space-y-4'>
      <QuantityStrip task={task} />
      <div className='grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm'>
        <div>
          <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Audit Location</p>
          <p className='font-medium'>{task.metadata?.locationId || '—'}</p>
        </div>
        <div>
          <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Target Variant</p>
          <p className='font-medium font-mono text-xs'>{task.metadata?.variantId || '—'}</p>
        </div>
        <div>
          <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Physically Counted Qty</p>
          <p className='font-semibold text-emerald-600'>{task.metadata?.suggestedQty ?? '—'}</p>
        </div>
      </div>
    </div>
  )
}

function WasteDisposalDetails({ task }: TaskDetailsTabProps) {
  if (!task) return null
  return (
    <div className='space-y-4'>
      <QuantityStrip task={task} />
      <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm'>
        <div>
          <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Damaged/Expired Item</p>
          <p className='font-medium font-mono text-xs'>{task.metadata?.variantId || '—'}</p>
        </div>
        <div>
          <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Waste Quantity</p>
          <p className='font-semibold text-destructive'>{task.metadata?.suggestedQty ?? '—'}</p>
        </div>
        <div>
          <p className='text-[0.65rem] uppercase font-bold text-slate-400'>From Location</p>
          <p className='font-medium'>{task.metadata?.locationId || '—'}</p>
        </div>
        <div>
          <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Batch / Lot Number</p>
          <p className='font-medium font-mono'>{task.metadata?.batchNumber || 'N/A'}</p>
        </div>
      </div>
    </div>
  )
}

function CashReconciliationDetails({ task }: TaskDetailsTabProps) {
  if (!task) return null
  return (
    <div className='grid grid-cols-3 gap-4 text-sm'>
      <div>
        <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Expected (Cents)</p>
        <p className='font-medium'>{task.metadata.expectedCash ? `₱${(task.metadata.expectedCash / 100).toFixed(2)}` : '—'}</p>
      </div>
      <div>
        <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Actual Counted</p>
        <p className='font-medium'>{task.metadata.verifiedCash ? `₱${(task.metadata.verifiedCash / 100).toFixed(2)}` : '—'}</p>
      </div>
      <div>
        <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Variance</p>
        <p className={cn('font-bold', task.metadata.variance! < 0 ? 'text-destructive' : 'text-emerald-600')}>
          {task.metadata?.variance ? `₱${(task.metadata.variance / 100).toFixed(2)}` : '₱0.00'}
        </p>
      </div>
    </div>
  )
}

function GeneralChoreDetails({ task }: TaskDetailsTabProps) {
  if (!task) return null
  if (!task.metadata || Object.keys(task.metadata).length === 0) {
    return <p className='text-sm font-medium text-slate-500'>Standard chore sequence without sub-metadata values.</p>
  }
  return (
    <div className='text-sm'>
      <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Task Metadata Payload</p>
      <pre className='mt-1 text-xs p-3 rounded-xl border font-mono text-slate-600 overflow-x-auto'>{JSON.stringify(task.metadata, null, 2)}</pre>
    </div>
  )
}

const TASK_CONFIG = {
  [TaskType.SHELF_REFILL]: { component: ShelfRefillDetails, icon: ClipboardList },
  [TaskType.PURCHASE_REQUEST]: { component: PurchaseRequestDetails, icon: ShoppingBag },
  [TaskType.BRANCH_TRANSFER]: { component: BranchTransferDetails, icon: ArrowRightLeft },
  [TaskType.STOCK_COUNT]: { component: StockCountDetails, icon: BarChart3 },
  [TaskType.WASTE_DISPOSAL]: { component: WasteDisposalDetails, icon: Trash2 },
  [TaskType.CASH_RECONCILIATION]: { component: CashReconciliationDetails, icon: Banknote },
  [TaskType.GENERAL_CHORE]: { component: GeneralChoreDetails, icon: FileText },
} as const

// Task types that participate in the three-quantity model.
// CASH_RECONCILIATION and GENERAL_CHORE are excluded — they have no quantity concept.
// biome-ignore lint/correctness/noUnusedVariables: fix later
const QUANTITY_TASK_TYPES = new Set([TaskType.SHELF_REFILL, TaskType.PURCHASE_REQUEST, TaskType.BRANCH_TRANSFER, TaskType.STOCK_COUNT, TaskType.WASTE_DISPOSAL])

export const TaskDetailsTab = withForm({
  ...taskFormOpts,
  props: {} as TaskDetailsTabProps,
  render: ({ task, form }) => {
    if (!task) return null

    const taskTypeKey = (task?.type as TaskType) || TaskType.GENERAL_CHORE
    const config = TASK_CONFIG[taskTypeKey]
    const DetailsComponent = config.component
    const DetailsIcon = config.icon
    const { data: userOptions = [] } = fetchUserOptions()

    const rules = getTaskWorkflowRules(task.status as TaskStatus)

    return (
      <div className='space-y-6 m-0 px-6'>
        {/* 1. COMPREHENSIVE ACCOUNTABILITY & TRACKING CARD */}
        <Card className='shadow-sm border-none'>
          <CardHeader>
            <CardTitle className='text-sm font-semibold flex items-center gap-2'>
              <ShieldCheck className='h-4 w-4 text-primary' /> Multi-Stage Flow Verification
            </CardTitle>
          </CardHeader>
          <CardContent className='grid sm:grid-cols-2 md:grid-cols-3 gap-6'>
            {/* STAGE A: CREATOR */}
            <div className='space-y-4'>
              <div>
                <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Created By</p>
                <p className='text-sm font-medium'>{task.creator?.name || 'System Auto-Gen'}</p>
              </div>
              <div>
                <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Creation Date</p>
                <p className='text-sm font-medium'>{dayjs(task.createdAt).format('MMM DD, YYYY hh:mm A')}</p>
              </div>
            </div>

            {/* STAGE B: OPERATIONAL ASSIGNED CLERK */}
            <div className='space-y-3'>
              <div>
                <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Assigned Clerk</p>
                {rules.hasPassedApproval || rules.isTerminal ? (
                  <p className='text-sm font-medium mb-5'>{task.clerk?.name || 'Unassigned Operator'}</p>
                ) : (
                  <form.Field
                    name='clerkId'
                    children={field => (
                      <SelectInput
                        field={field}
                        placeholder={task.clerk?.name || 'Assign Clerk...'}
                        options={userOptions}
                        disabled={userOptions.length === 0}
                      />
                    )}
                  />
                )}
              </div>
              <div>
                <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Fulfilled At Timestamp</p>
                <p className='text-sm font-medium'>{task.fulfilledAt ? dayjs(task.fulfilledAt).format('MMM DD, YYYY hh:mm A') : '__'}</p>
              </div>
            </div>

            {/* STAGE C: AUTHORIZED MANAGER & POST-AUDIT STAGES */}
            <div className='space-y-3 sm:col-span-2 md:col-span-1'>
              <div>
                <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Authorized Manager</p>
                {rules.hasPassedApproval || rules.isTerminal ? (
                  <p className='text-sm font-medium mb-5'>
                    {task.status === TaskStatus.CANCELLED ? 'Workflow Voided' : task.approver?.name || 'System Released'}
                  </p>
                ) : (
                  <form.Field
                    name='approverId'
                    children={field => (
                      <SelectInput
                        field={field}
                        placeholder={task.approver?.name || 'Assign Supervisor...'}
                        options={userOptions}
                        disabled={userOptions.length === 0}
                      />
                    )}
                  />
                )}
              </div>

              <div>
                <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Post-Audit Reviewer</p>
                {rules.hasPassedReview || rules.isTerminal ? (
                  <p className='text-sm font-medium mb-5'>
                    {task.status === TaskStatus.CANCELLED ? 'Audit Terminated' : task.reviewer?.name || 'Verified & Closed'}
                  </p>
                ) : (
                  <form.Field
                    name='reviewerId'
                    children={field => (
                      <SelectInput
                        field={field}
                        placeholder={task.reviewer?.name || 'Assign Post-Audit Reviewer...'}
                        options={userOptions}
                        disabled={userOptions.length === 0}
                      />
                    )}
                  />
                )}
              </div>
            </div>

            {/* BLOCK D: TERMINATION EVENT MANIFEST */}
            {task.status === TaskStatus.CANCELLED && (
              <div className='p-3 bg-red-50 rounded-md border border-red-100 grid grid-cols-2 gap-4 col-span-full animate-in fade-in-50 duration-200'>
                <div>
                  <p className='text-[0.65rem] uppercase font-bold text-red-500'>Terminated By</p>
                  <p className='text-sm font-semibold text-red-700'>{task.canceler?.name || 'System Framework'}</p>
                </div>
                <div>
                  <p className='text-[0.65rem] uppercase font-bold text-red-500'>Cancellation Timestamp</p>
                  <p className='text-sm font-semibold text-red-700'>{task.canceledAt ? dayjs(task.canceledAt).format('MMM DD, YYYY hh:mm A') : '__'}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2. DYNAMIC WORK CONTEXT CARD */}
        <Card className='shadow-sm border-none'>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-semibold flex items-center gap-2'>
              <DetailsIcon className='h-4 w-4 text-blue-500' /> Dynamic Context Details
            </CardTitle>
            <div className='text-[0.65rem] font-mono text-slate-600 px-2 py-0.5 rounded uppercase tracking-wider'>{taskTypeKey.replace('_', ' ')}</div>
          </CardHeader>
          <CardContent className='space-y-6'>
            <DetailsComponent task={task} />

            {task.notes && (
              <div className='pt-4 border-t'>
                <p className='text-[0.65rem] uppercase font-bold text-slate-400 mb-1'>Operational Manifest Notes</p>
                <p className='text-sm text-slate-600 italic p-3 rounded border border-dashed'>"{task.notes}"</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  },
})
