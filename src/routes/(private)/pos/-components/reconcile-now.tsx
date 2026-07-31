import { and, count, eq, gte, inArray, lte, sum, useLiveQuery } from '@tanstack/react-db'
import { formOptions, useStore } from '@tanstack/react-form'
import { useNavigate } from '@tanstack/react-router'
import { AlertCircle, ShieldCheck } from 'lucide-react'
import { Role, SessionStatus, TaskStatus } from 'prisma/generated/prisma/enums'
import { useState } from 'react'
import { toast } from 'sonner'
import { Form } from '@/components/custom/form'
import { MoneyInput } from '@/components/custom/form/money-input'
import { TextAreaInput } from '@/components/custom/form/text-area-input'
import { AuthPrompt } from '@/components/custom/prompt/auth-prompt'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { membershipCollection, operationalTaskCollection, transactionCollection, vendorSessionCollection } from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
import { useAppForm } from '@/hooks/form'
import { AuthEngine } from '@/lib/better-auth/auth-engine'
import { PriceEngine } from '@/lib/conversion/price-engine'
import dayjs from '@/lib/dayjs'
import MountManager, { type MountProps } from '@/lib/mount-manager'
import { authStore } from '@/store/auth-store'

export const closeSessionFormOpts = formOptions({
  defaultValues: {
    closingCash: 0,
    notes: '' as string | null,
  },
})

export function ReconcileNow({ onClose }: MountProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const user = useStore(authStore, state => state.user)
  const navigate = useNavigate()

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

        // B4: task moves to FULFILLED (not REVIEWED directly — supervisor reviews via the task workflow)
        operationalTaskCollection.update(session.operationalTaskId, draft => {
          draft.status = TaskStatus.FULFILLED
          draft.notes = value.notes || `Reconciliation for session ${session.id}`
          draft.dueDate = dayjs().endOf('day').toDate()
          // B4: include verifiedCash and variance so CashReconciliationDetails can display them
          draft.metadata = { vendorSessionId: session.id, expectedCash, approvedCash: value.closingCash, verifiedCash, variance }
          draft.fulfilledAt = new Date()
        })

        vendorSessionCollection.update(session.id, draft => {
          draft.status = SessionStatus.CLOSED
          draft.endTime = new Date()
          draft.closingCash = verifiedCash
          draft.expectedCash = expectedCash
          // B4: verifiedCash is the actual cash counted by the supervisor, not expectedCash
          draft.verifiedCash = verifiedCash
        })
      })

      if (result.isErr()) {
        console.error('Transaction failed:', result.error.message)
        toast.error('Failed to close session.')
        return
      }

      toast.success('Shift ended successfully')
      AuthEngine.logout({ onSuccess: () => navigate({ to: '/login' }) })

      onClose()
    },
  })

  const handleAuthenticate = async () => {
    const result = await new Promise<boolean>(resolve => {
      MountManager.show(AuthPrompt, {
        onConfirm: async auth => {
          if (auth.role !== Role.ADMIN) {
            toast.error('You are not authorized to reconcile this shift')
            resolve(false)
            return false
          }

          resolve(true)
          return true
        },
      })
    })

    setIsAuthenticated(result)
  }

  if (!isAuthenticated) {
    return (
      <div className='h-32 flex items-center justify-center'>
        <Button type='submit' onClick={handleAuthenticate} className='h-12 rounded-xl text-md font-bold gap-2 shadow-lg shadow-primary/20'>
          <ShieldCheck className='size-5' /> Authenticate
        </Button>
      </div>
    )
  }

  return (
    <Form onSubmit={form.handleSubmit} className='space-y-4'>
      <div className='grid grid-cols-2 gap-3'>
        {/* Row 1: Activity Overview */}
        <div className='p-4 rounded-2xl bg-muted/30 border border-border/50'>
          <p className='text-[10px] uppercase font-bold text-muted-foreground mb-1 tracking-wider'>Transactions</p>
          {transactions.isLoading ? (
            <Skeleton className='h-12 w-full rounded-2xl' />
          ) : (
            <p className='text-xl font-bold tracking-tight'>{transactions.data?.[0]?.totalTransactions || 0}</p>
          )}
        </div>

        <div className='p-4 rounded-2xl bg-muted/30 border border-border/50'>
          <p className='text-[10px] uppercase font-bold text-muted-foreground mb-1 tracking-wider'>Total Sales</p>
          {transactions.isLoading ? (
            <Skeleton className='h-12 w-full rounded-2xl' />
          ) : (
            <p className='text-xl font-bold tracking-tight'>{PriceEngine.format(Number(transactions.data?.[0]?.totalSales) || 0)}</p>
          )}
        </div>

        {/* Row 2: Starting Point & Final Target */}
        <div className='p-4 rounded-2xl bg-muted/30 border border-border/50'>
          <p className='text-[10px] uppercase font-bold text-muted-foreground mb-1 tracking-wider'>Opening Cash</p>
          {transactions.isLoading ? (
            <Skeleton className='h-12 w-full rounded-2xl' />
          ) : (
            <p className='text-xl font-bold tracking-tight'>{PriceEngine.format(Number(user.vendorSession?.openingCash) || 0)}</p>
          )}
        </div>

        <div className='p-4 rounded-2xl bg-primary/10 border border-primary/20 shadow-sm'>
          <p className='text-[10px] uppercase font-bold text-primary mb-1 tracking-wider'>Expected Cash</p>
          {transactions.isLoading ? (
            <Skeleton className='h-12 w-full rounded-2xl' />
          ) : (
            <div className='flex items-baseline gap-1'>
              <p className='text-xl font-black text-primary'>{PriceEngine.format(expectedCash)}</p>
            </div>
          )}
        </div>
      </div>

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
              className='w-full h-12 rounded-xl text-md font-bold gap-2 shadow-lg shadow-primary/20'
            >
              {isSubmitting ? (
                'Authenticating & Closing...'
              ) : (
                <>
                  <ShieldCheck className='size-5' /> Reconcile Now (Supervisor)
                </>
              )}
            </Button>
          </div>
        )}
      />
    </Form>
  )
}
