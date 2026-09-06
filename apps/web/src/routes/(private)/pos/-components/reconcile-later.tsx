import { Form } from '@platform/components/custom/form'
import { MoneyInput } from '@platform/components/custom/form/money-input'
import { TextAreaInput } from '@platform/components/custom/form/text-area-input'
import { Button } from '@platform/components/ui/button'
import { membershipCollection, operationalTaskCollection, transactionCollection, vendorSessionCollection } from '@platform/db/collections'
import { dbTransaction } from '@platform/db/local-db-transaction'
import { useAppForm } from '@platform/hooks/form'
import { useCapability } from '@platform/hooks/use-capability'
import dayjs from '@platform/lib/dayjs'
import { Capabilities } from '@platform/lib/entitlement/capability-keys'
import type { MountProps } from '@platform/lib/mount-manager'
import { and, count, eq, gte, inArray, lte, sum, useLiveQuery } from '@tanstack/react-db'
import { formOptions } from '@tanstack/react-form'
import { useNavigate } from '@tanstack/react-router'
import { AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react'
import type { VendorSession } from 'prisma/generated/prisma/browser'
import { NotificationType, Role, SessionStatus, TaskStatus } from 'prisma/generated/prisma/enums'
import { useState } from 'react'
import { toast } from 'sonner'
import { logout } from '@/lib/better-auth/auth-engine'
import { authStore, useAuthenticatedUser } from '@/lib/better-auth/auth-store'
import { PriceEngine } from '@/lib/conversion/price-engine'
import { NotificationEngine } from '@/lib/notification/notification-engine'

export const closeSessionFormOpts = formOptions({
  defaultValues: {
    closingCash: 0,
    notes: '' as string | null,
  },
})

type SubmissionType = 'CREATE_TASK' | 'INSTANT_RECONCILE'

export function ReconcileLater({ onClose }: MountProps) {
  const [submissionType, setSubmissionType] = useState<SubmissionType>('CREATE_TASK')
  const user = useAuthenticatedUser()
  const navigate = useNavigate()
  const canCreateTask = useCapability(Capabilities.CREATE_TASK)

  const members = useLiveQuery(q => q.from({ member: membershipCollection }).where(({ member }) => inArray(member.role, [Role.ADMIN, Role.SUPERVISOR])), [])
  const sessions = useLiveQuery(
    q =>
      q
        .from({ session: vendorSessionCollection })
        .where(({ session }) => eq(session.id, user.vendorSession?.id))
        .leftJoin({ task: operationalTaskCollection }, ({ task, session }) => eq(session.operationalTaskId, task.id))
        .select(({ session, task }) => ({ ...session, operationalTask: task })),
    [],
  )

  const transactions = useLiveQuery(
    q =>
      q
        .from({ transaction: transactionCollection })
        .where(({ transaction }) =>
          and(
            eq(transaction.cashierId, user.id),
            gte(transaction.createdAt, dayjs(user.vendorSession?.startTime).toDate()),
            lte(transaction.createdAt, dayjs().endOf('day').toDate()),
          ),
        )
        .select(({ transaction }) => ({ totalSales: sum(transaction.totalAmount), totalTransactions: count(transaction.id) })),
    [],
  )

  const expectedCash = (user.vendorSession?.openingCash || 0) + (Number(transactions.data?.[0]?.totalSales) || 0)

  const form = useAppForm({
    ...closeSessionFormOpts,
    defaultValues: {
      closingCash: 0,
      notes: '',
    },
    onSubmit: async ({ value }) => {
      const session = sessions.data[0]
      const admins = members.data
      if (!session?.id) return
      if (admins.length === 0) return

      const result = await dbTransaction(() => {
        const verifiedCash = Number(value.closingCash)
        const variance = verifiedCash - expectedCash

        // Create the Reconciliation Task
        operationalTaskCollection.update(session.operationalTaskId, draft => {
          draft.status = TaskStatus.IN_PROGRESS
          draft.notes = value.notes || `Reconciliation for session ${session.id}`
          draft.dueDate = dayjs().endOf('day').toDate()
          // B5: capture verifiedCash and variance so the supervisor can see the discrepancy on review
          draft.metadata = { vendorSessionId: session.id, expectedCash, approvedCash: value.closingCash, verifiedCash, variance }
          draft.inProgressAt = new Date()
        })

        // Update the Session
        vendorSessionCollection.update(session.id, draft => {
          draft.status = SessionStatus.CLOSED
          draft.endTime = new Date()
          draft.closingCash = verifiedCash
          draft.expectedCash = expectedCash
          // DEV-8: write verifiedCash to session record so both reconciliation paths
          // produce a consistent session state. ReconcileNow already sets this field;
          // ReconcileLater was the only path that left it null.
          // The supervisor's REVIEWED step on the task is the formal confirmation;
          // this write records the cashier's submitted count at session close time.
          draft.verifiedCash = verifiedCash
        })

        NotificationEngine.send(
          admins.map(admin => admin.userId),
          {
            type: NotificationType.COMPLIANCE_REMINDER,
            title: 'Shift Closed & Awaiting Review',
            message: `${user.name || 'A cashier'} has ended their shift for session ${session.id}. Expected: ${PriceEngine.format(expectedCash)}, Actual: ${PriceEngine.format(Number(value.closingCash))}.`,
            metadata: { vendorSessionId: session.id, taskId: session.operationalTaskId },
            link: `/tasks/${session.operationalTaskId}`,
          },
        )
      })

      if (result.isErr()) {
        console.error('Transaction failed:', result.error.message)
        toast.error('Failed to close session.')
        return
      }

      // Update global state and reload to reset POS gate
      authStore.setState(state => {
        state.user.vendorSession = vendorSessionCollection.get(session.id) as VendorSession
        return state
      })
      toast.success('Shift ended successfully')

      onClose()
      if (user.role === Role.CASHIER) logout({ onSuccess: () => navigate({ to: '/login' }) })
      else navigate({ to: user.landingPage })
    },
  })

  return (
    <Form onSubmit={form.handleSubmit} className='space-y-4'>
      <form.Field name='closingCash' children={field => <MoneyInput field={field} label='Actual Cash in Drawer' />} />

      <form.Field
        name='notes'
        children={field => <TextAreaInput field={field} label='Discrepancy Notes (Optional)' placeholder='Explain any shortages or overs...' />}
      />

      <div className='bg-amber-50 p-4 rounded-2xl border border-amber-100 flex gap-3'>
        <AlertCircle className='h-5 w-5 text-amber-500 shrink-0 mt-0.5' />
        <p className='text-xs text-amber-700 leading-relaxed'>
          Confirming this will lock your sales for this shift and generate a reconciliation task for the supervisor.
        </p>
      </div>

      <form.Subscribe
        selector={state => [state.canSubmit, state.isSubmitting]}
        children={([canSubmit, isSubmitting]) => (
          <div className='flex flex-col gap-2 w-full'>
            {/* Primary Button: End Shift (Standard Task Creation) */}
            <Button
              type='submit'
              disabled={!canSubmit || transactions.isLoading}
              onClick={() => setSubmissionType('INSTANT_RECONCILE')}
              className='w-full h-12 rounded-xl text-md font-bold gap-2 shadow-lg shadow-primary/20'
            >
              {isSubmitting && submissionType === 'INSTANT_RECONCILE' ? (
                'Authenticating & Closing...'
              ) : (
                <>
                  <ShieldCheck className='size-5' /> Reconcile Now (Supervisor)
                </>
              )}
            </Button>

            {/* Secondary Button: Direct Supervisor Reconciliation */}
            {canCreateTask ? (
              <Button
                type='submit'
                variant='ghost'
                disabled={!canSubmit || transactions.isLoading}
                onClick={() => setSubmissionType('CREATE_TASK')}
                className='w-full h-12 text-muted-foreground font-bold hover:text-foreground hover:bg-muted rounded-xl flex items-center justify-center gap-2'
              >
                {isSubmitting && submissionType === 'CREATE_TASK' ? (
                  'Opening Drawer...'
                ) : (
                  <>
                    <CheckCircle2 className='size-5' /> End Shift & Create Task
                  </>
                )}
              </Button>
            ) : null}
          </div>
        )}
      />
    </Form>
  )
}
