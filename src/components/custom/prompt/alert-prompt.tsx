import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { OverlayProps } from '@/lib/overlay'
import type { Prettify } from '@/lib/types'

const alertPromptSchema = {
  title: 'Alert!' as string | ReactNode,
  description: 'Something requires your attention. Please review the details before proceeding.' as string | ReactNode,
  btnText: 'Close' as string,
}

export type AlertPromptProps = Prettify<
  OverlayProps &
    Partial<typeof alertPromptSchema> & {
      onClick?: () => void
    }
>

export function AlertPrompt(props: AlertPromptProps) {
  const { open, onClose, title, description, btnText, onClick } = {
    ...alertPromptSchema,
    ...props,
  }

  const handleClose = () => {
    onClick?.()
    onClose()
  }

  return (
    <Dialog open={open}>
      <DialogContent
        className='sm:max-w-106.25 text-center fixed top-[20%] left-[50%] -translate-x-[50%] -translate-y-[30%] mt-8 [&>button]:hidden'
        onEscapeKeyDown={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
      >
        <DialogHeader className='flex flex-col items-center justify-center gap-4'>
          <div className='rounded-full bg-amber-100 p-3 dark:bg-amber-900/20'>
            <AlertTriangle className='h-24 w-24 text-amber-600 dark:text-amber-400' />
          </div>

          <DialogTitle className='text-2xl font-bold uppercase tracking-tight'>{title}</DialogTitle>
          <DialogDescription className='text-center text-base'>{description}</DialogDescription>
        </DialogHeader>

        <DialogFooter className='sm:justify-center mt-2'>
          <Button type='button' onClick={handleClose} className='w-full sm:w-32 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-full'>
            {btnText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
