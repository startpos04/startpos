import { useForm } from '@tanstack/react-form'
import { ShieldCheck } from 'lucide-react'
import type { Role } from 'prisma/generated/prisma/enums'
import { z } from 'zod'
import { Form } from '@platform/components/custom/form'
import { Button } from '@platform/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@platform/components/ui/dialog'
import { AuthEngine } from '@platform/lib/better-auth/auth-engine'
import type { MountProps } from '@/lib/mount-manager'
import { TextInput } from '../form/text-input'

const authPromptSchema = z.object({
  email: z.email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export type AuthPromptFormData = z.infer<typeof authPromptSchema>

export interface AuthPromptProps extends MountProps {
  onConfirm: (auth: { id: string; role: Role; name: string }) => Promise<boolean>
}

export function AuthPrompt({ open, onClose, onConfirm }: AuthPromptProps) {
  const form = useForm({
    defaultValues: {
      email: '',
      password: '',
    },
    validators: {
      onChange: authPromptSchema,
    },
    onSubmit: async ({ value }) => {
      const auth = await AuthEngine.authorizeFeature(value)
      form.reset()
      if (!auth) return
      if (await onConfirm(auth)) onClose()
    },
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className='w-[calc(100%-2rem)] sm:max-w-md p-6 bg-background rounded-[2rem] border-none shadow-2xl gap-4 [&>button]:hidden'
        onEscapeKeyDown={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
      >
        <DialogHeader className='flex flex-col items-center justify-center gap-2 text-center'>
          <div className='rounded-full bg-indigo-100 p-3 dark:bg-indigo-900/20'>
            <ShieldCheck className='h-12 w-12 text-indigo-600 dark:text-indigo-400' />
          </div>
          <DialogTitle className='text-2xl font-bold tracking-tight'>Supervisor Authorization</DialogTitle>
          <DialogDescription className='text-base text-muted-foreground'>
            Please provide manager credentials to instantly finalize and approve this reconciliation.
          </DialogDescription>
        </DialogHeader>

        <Form onSubmit={form.handleSubmit} className='space-y-4'>
          <form.Field name='email' children={field => <TextInput field={field} label='Email' />} />

          <form.Field name='password' children={field => <TextInput type='password' field={field} label='Password' />} />

          <form.Subscribe
            selector={state => [state.canSubmit, state.isSubmitting]}
            children={([canSubmit, isSubmitting]) => (
              <DialogFooter className='sm:justify-center flex-col sm:flex-row gap-2 w-full pt-2'>
                <DialogClose asChild>
                  <Button
                    type='button'
                    variant='outline'
                    className='w-full sm:flex-1 h-12 rounded-xl text-md font-medium'
                    disabled={isSubmitting}
                    onClick={() => {
                      form.reset()
                      onClose()
                    }}
                  >
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type='submit'
                  disabled={!canSubmit || isSubmitting}
                  className='w-full sm:flex-1 h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-md font-bold'
                >
                  {isSubmitting ? 'Verifying...' : 'Authorize'}
                </Button>
              </DialogFooter>
            )}
          />
        </Form>
      </DialogContent>
    </Dialog>
  )
}
