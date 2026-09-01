import { useForm, useStore } from '@tanstack/react-form'
import { useNavigate } from '@tanstack/react-router'
import { Info, LayoutDashboard, LogOut, PlayCircle } from 'lucide-react'
import { Role, SessionStatus, TaskStatus, TaskType } from 'prisma/generated/prisma/enums'
import { toast } from 'sonner'
import { z } from 'zod'
import { Form } from '@/components/custom/form'
import { MoneyInput } from '@/components/custom/form/money-input'
import { TextAreaInput } from '@/components/custom/form/text-area-input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { operationalTaskCollection, vendorSessionCollection } from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
import { AuthEngine } from '@/lib/better-auth/auth-engine'
import type { MountProps } from '@/lib/mount-manager'
import { authStore } from '@/lib/better-auth/auth-store'

export const createSessionSchema = z
  .object({
    openingCash: z.number({ error: 'Starting float is required' }).min(0, 'Starting float cannot be negative'),
    notes: z.string(),
  })
  .refine(
    _ => {
      const hasActiveSession = [...vendorSessionCollection.values()].some(s => s.status === 'OPEN')
      return !hasActiveSession
    },
    {
      message: 'You have an existing open session. Please close it before starting a new one.',
      path: ['openingCash'],
    },
  )

export type CreateSessionFormData = z.infer<typeof createSessionSchema>

export function OpenSessionDialog({ open, onClose }: MountProps) {
  const user = useStore(authStore, state => state.user)
  const navigate = useNavigate()

  const form = useForm({
    defaultValues: {
      openingCash: 100000, // Common starting float in PH (₱1,000)
      notes: '',
    },
    validators: {
      onChange: createSessionSchema,
    },
    onSubmit: async ({ value }) => {
      const taskId = crypto.randomUUID()
      const session = {
        id: crypto.randomUUID(),
        userId: user.id,
        startTime: new Date(),
        openingCash: Number(value.openingCash),
        status: SessionStatus.OPEN,
        notes: value.notes || null,
        endTime: null,
        closingCash: null,
        expectedCash: null,
        verifiedCash: null,
        operationalTaskId: taskId,
        businessId: user.business.id,
        branchId: user.branch.id,
      }

      const result = await dbTransaction(() => {
        operationalTaskCollection.insert({
          id: taskId,
          type: TaskType.CASH_RECONCILIATION,
          status: TaskStatus.DRAFT,
          notes: null,
          dueDate: new Date(),
          creatorId: user.id,
          approverId: user.id,
          clerkId: user.id,
          metadata: {
            expectedCash: null,
            approvedCash: null,
            verifiedCash: null,
          },
          approvedAt: new Date(),
          inProgressAt: new Date(),
          fulfilledAt: null,
          reviewedAt: null,
          reviewerId: null,
          canceledAt: null,
          cancelerId: null,
          businessId: user.business.id,
          branchId: user.branch.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })

        vendorSessionCollection.insert(session)
      })

      if (result.isErr()) {
        console.error('Transaction failed:', result.error.message)
        toast.error('Failed to start shift. Please try again.')
        return
      }

      // Update auth store AFTER the transaction confirms — moving this inside
      // the dbTransaction callback fired it prematurely, causing the POS guard
      // useEffect to re-run with a stale user reference and re-show the dialog.
      authStore.setState(state => {
        state.user.vendorSession = session
        return state
      })

      toast.success('Session started successfully')
      onClose()
    },
  })

  return (
    <Dialog open={open}>
      <DialogContent className='sm:max-w-lg p-4 overflow-hidden border-none shadow-2xl bg-background gap-0 [&>button]:hidden'>
        <DialogHeader className='mb-6'>
          <DialogTitle className='text-3xl font-bold tracking-tight'>Start Your Shift</DialogTitle>
          <DialogDescription className='text-emerald-100 text-base'>
            Recording new stock for <span className='font-bold text-white'> Ready for the shift? Set your starting cash to begin recording sales.</span>
          </DialogDescription>
        </DialogHeader>

        <Form onSubmit={form.handleSubmit} className='space-y-4'>
          <form.Field name='openingCash' children={field => <MoneyInput field={field} label={`Starting Cash (${user.configs.CURRENCY})`} />} />

          <form.Field name='notes' children={field => <TextAreaInput field={field} label='Optional Notes' placeholder='e.g. Shift 1 - Monday' />} />

          <div className='bg-blue-50/50 p-4 rounded-2xl border border-blue-100 flex gap-3'>
            <Info className='h-5 w-5 text-blue-500 shrink-0 mt-0.5' />
            <p className='text-xs text-blue-700 leading-relaxed'>
              Opening the session will track all transactions until the drawer is closed at the end of the shift.
            </p>
          </div>

          <form.Subscribe
            selector={state => [state.canSubmit, state.isSubmitting]}
            children={([canSubmit, isSubmitting]) => (
              <Button type='submit' disabled={!canSubmit} className='w-full h-12 rounded-xl text-md font-bold gap-2 shadow-lg shadow-primary/20'>
                {isSubmitting ? (
                  'Opening Drawer...'
                ) : (
                  <>
                    <PlayCircle className='h-5! w-5!' /> Start Shift
                  </>
                )}
              </Button>
            )}
          />
          <Button
            type='button'
            variant='ghost'
            className='w-full h-12 text-muted-foreground font-bold hover:text-foreground hover:bg-muted rounded-xl flex items-center justify-center gap-2'
            onClick={() => {
              user.role === Role.CASHIER ? AuthEngine.logout({ onSuccess: () => navigate({ to: '/login' }) }) : navigate({ to: user.landingPage })
              onClose()
            }}
          >
            {user.role === Role.CASHIER ? (
              <>
                <LogOut className='h-5! w-5!' /> Logout
              </>
            ) : (
              <>
                <LayoutDashboard className='h-5! w-5!' /> Go to Dashboard
              </>
            )}
          </Button>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
