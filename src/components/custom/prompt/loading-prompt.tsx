import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { OverlayProps } from '@/lib/overlay'
import type { Prettify } from '@/lib/types'

const loadingPromptSchema = {
  title: 'Processing...' as string | ReactNode,
  description: 'Please wait while we update our records. Do not refresh the page.' as string | ReactNode,
  icon: undefined as ReactNode | undefined,
}

export type LoadingPromptProps = Prettify<OverlayProps & typeof loadingPromptSchema>

export function LoadingPrompt(props: LoadingPromptProps) {
  const { open, title, description, icon } = {
    ...loadingPromptSchema,
    ...props,
  }

  return (
    <Dialog open={open}>
      <DialogContent
        className='sm:max-w-106.25 text-center fixed top-[20%] left-[50%] -translate-x-[50%] -translate-y-[30%] mt-8 [&>button]:hidden'
        onEscapeKeyDown={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
      >
        <DialogHeader className='flex flex-col items-center justify-center gap-4'>
          <div className='flex items-center justify-center p-3'>
            {icon ? (
              <div className='rounded-full bg-blue-100 p-4 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'>{icon}</div>
            ) : (
              <Loader2 className='h-24 w-24 animate-spin text-blue-600 dark:text-blue-400' />
            )}
          </div>

          <DialogTitle className='text-2xl font-bold'>{title}</DialogTitle>
          <DialogDescription className='text-center text-lg'>{description}</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}
