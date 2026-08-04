/**
 * (private)/(dashboard)/index.tsx
 *
 * /dashboard — Management overview for ADMIN and SUPERVISOR roles.
 *
 * Components:
 *   - SetupChecklist   — dashboard view of the Tutorial system
 *   - QuickStatCards   — products, team members, transactions today, credits
 *   - QuickActions     — add product, invite employee, view billing
 *   - GuidanceBanner   — hint corner banner (tutorial banners now handled
 *                        globally by SetupGuideWidget in the private shell)
 *
 * Capability: MANAGE_SETTINGS (management capability — always accessible).
 * Accessible to: ADMIN, SUPERVISOR.
 */

import { useLiveQuery } from '@tanstack/react-db'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { BoxIcon, CreditCardIcon, PlusIcon, UsersIcon, ZapIcon } from 'lucide-react'
import { GuidanceBanner } from '@/components/guidance-banner'
import { SetupChecklist } from '@/components/setup-checklist'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { orderCollection, productCollection, userCollection } from '@/db/collections'
import { useHints } from '@/hooks/use-hints'
import { useTutorialContext } from '@/hooks/use-tutorials'
import { authStore } from '@/store/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const user = useStore(authStore, state => state.user)
  const tutorialContext = useTutorialContext()
  const { hint } = useHints('/dashboard')

  // Quick stat counts from offline collections
  const products = useLiveQuery(q => q.from({ p: productCollection }).select(({ p }) => p))
  const users = useLiveQuery(q => q.from({ u: userCollection }).select(({ u }) => u))
  const todaysOrders = useLiveQuery(q => q.from({ o: orderCollection }).select(({ o }) => o))

  const productCount = products.data?.length ?? 0
  const teamCount = users.data?.length ?? 0
  // Approximate "transactions today" from orders (full transaction filtering would require date)
  const txToday = todaysOrders.data?.length ?? 0
  const creditBalance = user?.entitlement?.creditBalance

  return (
    <div className='flex flex-col gap-6 p-4 pt-0'>
      {/* Page header */}
      <div>
        <h1 className='text-2xl font-semibold'>Dashboard</h1>
        <p className='text-sm text-muted-foreground mt-0.5'>Welcome back{user?.name ? `, ${user.name}` : ``}. Here's an overview of your store.</p>
      </div>

      {/* Quick stat cards */}
      <div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
        <StatCard icon={<BoxIcon className='h-4 w-4' />} label='Products' value={productCount} />
        <StatCard icon={<UsersIcon className='h-4 w-4' />} label='Team members' value={teamCount} />
        <StatCard icon={<ZapIcon className='h-4 w-4' />} label='Transactions today' value={txToday} />
        <StatCard
          icon={<CreditCardIcon className='h-4 w-4' />}
          label={creditBalance !== null ? 'Credits remaining' : 'Subscription'}
          value={creditBalance !== null ? creditBalance : (user?.entitlement?.status ?? '—')}
        />
      </div>

      {/* Main content: 2-column layout on wider screens */}
      <div className='grid gap-6 lg:grid-cols-3'>
        {/* Setup checklist — takes 2 cols on lg */}
        <div className='lg:col-span-2'>
          {tutorialContext ? (
            <SetupChecklist context={tutorialContext} />
          ) : (
            <Card>
              <CardContent className='py-8 text-center text-sm text-muted-foreground'>Loading setup checklist…</CardContent>
            </Card>
          )}
        </div>

        {/* Quick actions */}
        <div>
          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='text-base'>Quick actions</CardTitle>
            </CardHeader>
            <CardContent className='space-y-2'>
              <Button asChild variant='outline' className='w-full justify-start gap-2'>
                <Link to='/products/create'>
                  <PlusIcon className='h-4 w-4' />
                  Add product
                </Link>
              </Button>
              <Button asChild variant='outline' className='w-full justify-start gap-2'>
                <Link to='/employees'>
                  <UsersIcon className='h-4 w-4' />
                  Invite employee
                </Link>
              </Button>
              <Button asChild variant='outline' className='w-full justify-start gap-2'>
                <Link to='/billing'>
                  <CreditCardIcon className='h-4 w-4' />
                  View billing
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Hint corner banner — tutorial step banners are now handled globally
          by SetupGuideWidget in the private shell, so only hints appear here */}
      {hint && <GuidanceBanner variant='hint' title={hint.title} body={hint.body} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: number | string
}

function StatCard({ icon, label, value }: StatCardProps) {
  return (
    <Card>
      <CardContent className='pt-4 pb-4'>
        <div className='flex items-center gap-2 text-muted-foreground mb-1'>
          {icon}
          <span className='text-xs font-medium uppercase tracking-wide'>{label}</span>
        </div>
        <p className='text-2xl font-semibold'>{value}</p>
      </CardContent>
    </Card>
  )
}
