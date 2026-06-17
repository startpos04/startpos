import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { OverlayProps } from '@/lib/overlay'
import type { Prettify } from '@/lib/types'

const warningPromptSchema = {
  title: 'Are you sure?' as string | ReactNode,
  description: 'This action might have unintended consequences. Please review your changes before proceeding.' as unknown as string | ReactNode,
  btnText: 'Confirm' as string,
  onConfirm: (() => Promise.resolve(true)) as () => Promise<boolean>,
}

export type WarningPromptProps = Prettify<OverlayProps & Partial<typeof warningPromptSchema> & OverlayProps>

export function WarningPrompt(props: WarningPromptProps) {
  const { open, onClose, onConfirm, title, description, btnText } = { ...warningPromptSchema, ...props }

  const handleConfirm = async () => {
    if (await onConfirm()) onClose()
  }

  return (
    <Dialog open={open}>
      <DialogContent
        className='sm:max-w-106.25 text-center fixed top-[20%] left-[50%] -translate-x-[50%] -translate-y-[30%] mt-8 [&>button]:hidden'
        onEscapeKeyDown={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
      >
        <DialogHeader className='flex flex-col items-center justify-center gap-4'>
          {/* Warning Icon Container */}
          <div className='rounded-full bg-amber-100 p-3 dark:bg-amber-900/20'>
            <AlertTriangle className='h-24 w-24 text-amber-600 dark:text-amber-400' />
          </div>

          <DialogTitle className='text-2xl font-bold'>{title}</DialogTitle>
          <DialogDescription className='text-center'>{description}</DialogDescription>
        </DialogHeader>

        <DialogFooter className='sm:justify-center flex-col sm:flex-row gap-2'>
          <DialogClose asChild>
            <Button type='button' variant='outline' className='w-full sm:w-32' onClick={onClose}>
              Cancel
            </Button>
          </DialogClose>
          <Button type='button' onClick={handleConfirm} className='w-full sm:w-32 bg-amber-600 hover:bg-amber-700 text-white'>
            {btnText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
