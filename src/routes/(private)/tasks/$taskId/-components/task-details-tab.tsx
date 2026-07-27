// task-details-tab.tsx

import { ArrowRightLeft, Banknote, BarChart3, ClipboardList, FileText, ShieldCheck, ShoppingBag, Trash2 } from 'lucide-react'
import { TaskStatus, TaskType } from 'prisma/generated/prisma/enums'
import { SelectInput } from '@/components/custom/form/select-input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { withForm } from '@/hooks/form'
import dayjs from '@/lib/dayjs'
import type { feTask } from '@/lib/queries/fetch-tasks'
import { fetchUserOptions } from '@/lib/queries/fetch-user-options'
import { cn } from '@/lib/utils'
import { taskFormOpts } from '../../create/-create-task'
import { getTaskWorkflowRules } from './task-workflow'

interface TaskDetailsTabProps {
  task: feTask
}

function ShelfRefillDetails({ task }: TaskDetailsTabProps) {
  if (!task) return null
  return (
    <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm'>
      <div>
        <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Refill Item (Variant)</p>
        <p className='font-medium font-mono text-xs'>{task.metadata?.variantId || '—'}</p>
      </div>
      <div>
        <p className='text-[0.65rem] uppercase font-bold text-slate-400'>Suggested Quantity</p>
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
  )
}

function PurchaseRequestDetails({ task }: TaskDetailsTabProps) {
  if (!task) return null
  return (
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
  )
}

function BranchTransferDetails({ task }: TaskDetailsTabProps) {
  if (!task) return null
  return (
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
  )
}

function StockCountDetails({ task }: TaskDetailsTabProps) {
  if (!task) return null
  return (
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
  )
}

function WasteDisposalDetails({ task }: TaskDetailsTabProps) {
  if (!task) return null
  return (
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
                    name='clerkId' // Changed from 'status' to target employee tracking
                    children={field => (
                      <SelectInput
                        field={field}
                        placeholder={task.clerk?.name || 'Assign Clerk...'}
                        options={userOptions} // Changed options source to employee array
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
                    name='approverId' // Changed from 'status'
                    children={field => (
                      <SelectInput
                        field={field}
                        placeholder={task.approver?.name || 'Assign Supervisor...'}
                        options={userOptions} // Changed options source
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
                    name='reviewerId' // Changed from 'status'
                    children={field => (
                      <SelectInput
                        field={field}
                        placeholder={task.reviewer?.name || 'Assign Post-Audit Reviewer...'}
                        options={userOptions} // Changed options source
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
