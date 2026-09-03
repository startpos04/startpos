import { CheckCircle2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@platform/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@platform/components/ui/dialog'
import type { MountProps } from '@platform/lib/mount-manager'
import type { Prettify } from '@platform/lib/types'

const successPromptSchema = {
  title: 'Action Successful' as string | ReactNode,
  description: 'Your changes have been saved to the database. You can now continue your workflow.' as unknown as string | ReactNode,
  btnText: 'OK' as string,
}

export type SuccessPromptProps = Prettify<MountProps & Partial<typeof successPromptSchema>>

export function SuccessPrompt(props: SuccessPromptProps) {
  const { open, onClose, title, description, btnText } = { ...successPromptSchema, ...props }

  return (
    <Dialog open={open}>
      <DialogContent
        className='sm:max-w-106.25 text-center fixed top-[20%] left-[50%] -translate-x-[50%] -translate-y-[30%] mt-8 [&>button]:hidden'
        onEscapeKeyDown={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
      >
        <DialogHeader className='flex flex-col items-center justify-center gap-4'>
          <div className='rounded-full bg-green-100 p-3 dark:bg-green-900/20'>
            <CheckCircle2 className='h-16 w-16 text-green-600 dark:text-green-400' />
          </div>

          <DialogTitle className='text-xl font-semibold'>{title}</DialogTitle>
          <DialogDescription className='text-center'>{description}</DialogDescription>
        </DialogHeader>

        <DialogFooter className='sm:justify-center gap-2'>
          <DialogClose asChild>
            <Button type='button' className='w-full sm:w-32 bg-green-600 hover:bg-green-700 text-white' onClick={onClose}>
              {btnText}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
