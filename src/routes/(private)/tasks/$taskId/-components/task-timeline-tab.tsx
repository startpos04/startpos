import { Ban, Calendar, CheckCircle2, Clock, FileCheck, History, Star } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import dayjs from '@/lib/dayjs'
import type { feTask } from '@/lib/queries/fetch-tasks'

interface TaskTimelineTabProps {
  task: feTask
}

export function TaskTimelineTab({ task }: TaskTimelineTabProps) {
  if (!task) return null

  return (
    <div className='space-y-6 m-0 px-6'>
      <Card className='shadow-sm border-none'>
        <CardHeader>
          <CardTitle className='text-sm font-semibold flex items-center gap-2'>
            <History className='h-5 w-5 text-slate-500' /> Audit Trail
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='relative ml-3 border-l-2 border-slate-100 pl-6 space-y-6'>
            <TimelineItem
              icon={<Calendar className='h-3.5 w-3.5' />}
              color='bg-slate-500'
              title='Task Created'
              date={task.createdAt}
              description={`Record initialized by ${task.creator?.name ?? 'system'}.`}
            />

            {task.approvedAt && (
              <TimelineItem
                icon={<CheckCircle2 className='h-3.5 w-3.5' />}
                color='bg-purple-500'
                title='Approved'
                date={task.approvedAt}
                description={`Cleared for execution by ${task.approver?.name ?? 'manager'}.`}
              />
            )}

            {task.inProgressAt && (
              <TimelineItem
                icon={<Clock className='h-3.5 w-3.5' />}
                color='bg-blue-500'
                title='Started'
                date={task.inProgressAt}
                description={`Execution begun by ${task.clerk?.name ?? 'assigned clerk'}.`}
              />
            )}

            {/* C5: fulfilledAt — present once clerk marks the task complete */}
            {task.fulfilledAt && (
              <TimelineItem
                icon={<FileCheck className='h-3.5 w-3.5' />}
                color='bg-indigo-500'
                title='Fulfilled'
                date={task.fulfilledAt}
                description={`Task completed and inventory updated by ${task.clerk?.name ?? 'clerk'}.`}
              />
            )}

            {/* C5: reviewedAt — present once a supervisor locks the record */}
            {task.reviewedAt && (
              <TimelineItem
                icon={<Star className='h-3.5 w-3.5' />}
                color='bg-emerald-500'
                title='Reviewed & Locked'
                date={task.reviewedAt}
                description={`Record verified and locked by ${task.reviewer?.name ?? 'reviewer'}. No further changes permitted.`}
              />
            )}

            {/* C5: canceledAt — present on the terminal CANCELLED path */}
            {task.canceledAt && (
              <TimelineItem
                icon={<Ban className='h-3.5 w-3.5' />}
                color='bg-red-500'
                title='Cancelled'
                date={task.canceledAt}
                description={`Task halted by ${task.canceler?.name ?? 'staff'}. Inventory changes were not applied.`}
              />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function TimelineItem({ icon, color, title, date, description }: { icon: React.ReactNode; color: string; title: string; date: Date; description: string }) {
  return (
    <div className='relative'>
      <div className={`absolute -left-10 -top-1 h-8 w-8 rounded-full border-2 border-gray-100 ${color} flex items-center justify-center text-white shadow-sm`}>
        {icon}
      </div>
      <div className='flex flex-col gap-0.5'>
        <span className='text-xs font-semibold'>{title}</span>
        <span className='text-[10px] font-medium text-slate-400'>{dayjs(date).format('MMM DD, YYYY — hh:mm A')}</span>
        <p className='text-xs text-slate-500 mt-1 leading-relaxed'>{description}</p>
      </div>
    </div>
  )
}
