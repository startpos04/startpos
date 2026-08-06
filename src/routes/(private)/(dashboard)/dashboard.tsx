/**
 * (private)/(dashboard)/index.tsx
 *
 * /dashboard — Management overview for ADMIN and SUPERVISOR roles.
 *
 * Components:
 *   - FirstRunGuide    — profile-aware "how to start selling" guide (new users)
 *   - HealthStageHint   — next-step hint based on Business.healthStage (Phase 4)
 *   - RecommendationCards — critical/high importance BOS recommendations (Phase 3b)
 *   - SetupChecklist    — shown after FirstRunGuide is dismissed/completed
 *   - QuickStatCards    — products, team members, transactions today, credits
 *   - QuickActions      — add product, invite employee, view billing
 *   - GuidanceBanner    — hint corner banner (tutorials handled globally)
 */

import { useLiveQuery } from '@tanstack/react-db'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { BoxIcon, CreditCardIcon, PlusIcon, UsersIcon, ZapIcon } from 'lucide-react'
import { RecommendationCard } from '@/components/custom/bos/recommendation-card'
import { FeatureLibrary } from '@/components/feature-library'
import { FirstRunGuide, useFirstRun } from '@/components/first-run-guide'
import { GuidanceBanner } from '@/components/guidance-banner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { orderCollection, productCollection, userCollection } from '@/db/collections'
import { useHints } from '@/hooks/use-hints'
import { HEALTH_STAGE_HINTS } from '@/lib/evolution/business-health-model'
import { fetchCapabilityStates } from '@/lib/queries/fetch-capability-states'
import { cn } from '@/lib/utils'
import { authStore } from '@/store/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const user = useStore(authStore, state => state.user)
  const { hint } = useHints('/dashboard')
  const qc = useQueryClient()
  const { isVisible: firstRunVisible } = useFirstRun()

  // Quick stat counts from offline collections
  const products = useLiveQuery(q => q.from({ p: productCollection }).select(({ p }) => p))
  const users = useLiveQuery(q => q.from({ u: userCollection }).select(({ u }) => u))
  const todaysOrders = useLiveQuery(q => q.from({ o: orderCollection }).select(({ o }) => o))

  const productCount = products.data?.length ?? 0
  const teamCount = users.data?.length ?? 0
  const txToday = todaysOrders.data?.length ?? 0
  const creditBalance = user?.entitlement?.creditBalance

  // BOS: fetch capability states for critical/high recommendations
  const { data: capabilities } = useQuery({
    queryKey: ['capability-states'],
    queryFn: () => fetchCapabilityStates(),
    staleTime: 60_000,
  })

  // Surface critical and high-importance RECOMMENDED capabilities on the dashboard.
  // importance is derived from score: critical ≥ 0.75, high ≥ 0.55.
  // We use recommendationScore as a proxy — show top 2 highest-scored RECOMMENDED caps.
  const topRecommendations = (capabilities ?? [])
    .filter(c => c.state === 'RECOMMENDED' && (c.recommendationScore ?? 0) >= 0.55)
    .sort((a, b) => (b.recommendationScore ?? 0) - (a.recommendationScore ?? 0))
    .slice(0, 2)

  // Health stage hint — sourced from Business.healthStage written by RecalculationJob
  const healthStage = user?.currentProfile ? null : (user as { healthStage?: string }).healthStage
  const healthHint = healthStage && healthStage in HEALTH_STAGE_HINTS ? HEALTH_STAGE_HINTS[healthStage as keyof typeof HEALTH_STAGE_HINTS] : null

  const refreshRecommendations = () => void qc.invalidateQueries({ queryKey: ['capability-states'] })

  return (
    <div className='flex flex-col gap-6 p-4 pt-0'>
      {/* Page header */}
      <div>
        <h1 className='text-2xl font-semibold'>Dashboard</h1>
        <p className='text-sm text-muted-foreground mt-0.5'>Welcome back{user?.name ? `, ${user.name}` : ''}. Here's an overview of your store.</p>
      </div>

      {/* Health stage hint — contextual next-step based on operational maturity */}
      {healthHint && (
        <div className={cn('rounded-lg border px-4 py-3 text-sm', 'border-primary/20 bg-primary/5 text-foreground')}>
          <span className='font-medium text-primary mr-1'>Next step:</span>
          {healthHint}
        </div>
      )}

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

      {/* BOS recommendations — critical/high importance only */}
      {topRecommendations.length > 0 && (
        <div className='space-y-3'>
          <h2 className='text-sm font-semibold text-muted-foreground uppercase tracking-wide'>Recommended for your business</h2>
          <div className='grid gap-3 sm:grid-cols-2'>
            {topRecommendations.map(cap => (
              <RecommendationCard
                key={cap.capabilityId}
                capabilityId={cap.capabilityId}
                label={cap.label}
                businessValue={cap.businessValue}
                reason={cap.recommendationReason ?? `Based on your business profile`}
                estimatedSetupMinutes={cap.estimatedSetupMinutes}
                isComplex={cap.isComplex}
                onDone={refreshRecommendations}
              />
            ))}
          </div>
        </div>
      )}

      {/* Main content: 2-column layout on wider screens */}
      <div className='grid gap-6 lg:grid-cols-3'>
        {/* Left column — first-run guide (new users) or feature library (returning) */}
        <div className='lg:col-span-2'>{firstRunVisible ? <FirstRunGuide /> : <FeatureLibrary />}</div>

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

      {/* Hint corner banner */}
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
