import type { MountProps } from '@platform/lib/mount-manager'
import { cn } from '@platform/lib/utils'
import type { ReactNode } from 'react'

interface AsideProps extends MountProps {
  children?: ReactNode
}

export function Aside({ open, children }: AsideProps) {
  return (
    <div
      className={cn(
        'h-full bg-card flex flex-col overflow-hidden z-20 shrink-0 transition-all duration-300 ease-in-out rounded-tl-2xl',
        'starting:w-0 starting:border-l-0 starting:border-transparent starting:shadow-none',
        open ? 'w-96 xl:w-lg border border-border shadow-xl' : 'w-0 border-l-0 border-transparent shadow-none',
      )}
    >
      <div
        className={cn(
          'w-96 xl:w-lg h-1 grow flex flex-col transition-opacity duration-200 starting:opacity-0',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
      >
        {children}
      </div>
    </div>
  )
}
