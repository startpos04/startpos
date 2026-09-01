import { Button } from '@startpos-core/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@startpos-core/components/ui/tooltip'
import { cn } from '@startpos-core/lib/utils'

interface ContextSwitcherItemProps {
  label: string
  icon: React.ReactNode
  active?: boolean
  onClick: () => void
  variant?: 'default' | 'ghost'
}

export function ContextSwitcherItem({ label, icon, active = false, onClick, variant = 'ghost' }: ContextSwitcherItemProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={active ? 'default' : variant}
            size='icon'
            className={cn('size-8 rounded-xl transition-all', active && 'btn-primary')}
            onClick={onClick}
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent side='right' sideOffset={12}>
          <p className='font-medium'>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
