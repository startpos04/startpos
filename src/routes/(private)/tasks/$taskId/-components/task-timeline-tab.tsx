import { Calendar, CheckCircle2, Clock, History } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import dayjs from '@/lib/dayjs'
import type { feTask } from '@/lib/queries/fetch-tasks'

interface TaskTimelineTabProps {
  task: feTask
}

export function TaskTimelineTab({ task }: TaskTimelineTabProps) {
  if (!task) return null // Fixed: Return null instead of undefined for React components

  return (
    <div className='space-y-6 m-0 px-6'>
      <Card className='shadow-sm border-none'>
        <CardHeader>
          <CardTitle className='text-sm font-semibold flex items-center gap-2'>
            {/* Fixed: Removed the '!' modifier which can break standard Tailwind */}
            <History className='h-5 w-5 text-slate-500' /> Audit Trail
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* The container handles the vertical line */}
          <div className='relative ml-3 border-l-2 border-slate-100 pl-6 space-y-6'>
            <TimelineItem
              icon={<Calendar className='h-3.5 w-3.5' />}
              title='Task Created'
              date={task.createdAt}
              description='Record initialized in local database.'
            />
            {task.approvedAt && (
              <TimelineItem
                icon={<CheckCircle2 className='h-3.5 w-3.5' />}
                title='Approved'
                date={task.approvedAt}
                description='Verification cleared for execution.'
              />
            )}
            {task.inProgressAt && (
              <TimelineItem icon={<Clock className='h-3.5 w-3.5' />} title='Started' date={task.inProgressAt} description='Staff began working on this task.' />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function TimelineItem({ icon, title, date, description }: { icon: React.ReactNode; title: string; date: Date; description: string }) {
  return (
    <div className='relative'>
      {/* Fixed: 
        - Used `-left-[31px]` to perfectly center a 24px (w-6) circle over a 2px border with pl-6 (24px + 1px half-border + 6px alignment offset).
        - Added bg-white so the timeline line doesn't peek through the icon badge.
      */}
      <div className='absolute -left-10 -top-1 h-8 w-8 rounded-full border-2 border-gray-100 bg-gray-600 flex items-center justify-center text-white shadow-sm'>
        {icon}
      </div>
      <div className='flex flex-col gap-0.5'>
        <span className='text-xs font-semibold '>{title}</span>
        <span className='text-[10px] font-medium text-slate-400'>{dayjs(date).format('MMM DD, YYYY — hh:mm A')}</span>
        <p className='text-xs text-slate-500 mt-1 leading-relaxed'>{description}</p>
      </div>
    </div>
  )
}
