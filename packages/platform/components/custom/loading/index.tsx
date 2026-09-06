import { cn } from '@platform/lib/utils'
import { GalleryVerticalEndIcon } from 'lucide-react'

function Loading({ className = 'h-full' }: { className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center', className)}>
      <div className='relative flex h-16 w-16 items-center justify-center'>
        <div className='absolute inset-0 animate-ping rounded-full bg-primary opacity-75' />
        <div className='absolute h-4/5 w-4/5 rounded-full bg-primary opacity-50 shadow-[0_0_20px_10px] shadow-secondary/40' />
        <GalleryVerticalEndIcon width={30} height={30} className='relative z-10' />
      </div>
    </div>
  )
}

export default Loading
