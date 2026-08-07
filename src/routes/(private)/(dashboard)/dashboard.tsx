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
import { BoxIcon, ChevronLeftIcon, ChevronRightIcon, CreditCardIcon, LifeBuoyIcon, LightbulbIcon, SparklesIcon, UsersIcon, ZapIcon } from 'lucide-react'
import { useState } from 'react'
import { RecommendationCard } from '@/components/custom/bos/recommendation-card'
import { FeatureLibrary } from '@/components/feature-library'
import { FirstRunGuide, useFirstRun } from '@/components/first-run-guide'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { orderCollection, productCollection, userCollection } from '@/db/collections'
import { HEALTH_STAGE_HINTS } from '@/lib/evolution/business-health-model'
import { fetchCapabilityStates } from '@/lib/queries/fetch-capability-states'
import { fetchDashboardHints } from '@/lib/server-fn/fetch-dashboard-hints'
import { cn } from '@/lib/utils'
import { authStore } from '@/store/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const user = useStore(authStore, state => state.user)
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

  // Tips & hints for the dashboard section
  const { data: dashboardHints = [] } = useQuery({
    queryKey: ['dashboard-hints'],
    queryFn: () => fetchDashboardHints(),
    staleTime: 0,
  })
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
    <div className='flex flex-col gap-6 px-4'>
      {/* Welcome banner */}
      <WelcomeBanner name={user?.name} businessName={user?.business?.name} />

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

        {/* Right column — tips carousel */}
        <div className='flex flex-col gap-4'>{dashboardHints.length > 0 && <TipsSection hints={dashboardHints} />}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TipsSection — carousel with prev/next navigation
// ---------------------------------------------------------------------------

interface HintItem {
  id: string
  title: string
  body: string
}

interface TipsSectionProps {
  hints: HintItem[]
}

function TipsSection({ hints }: TipsSectionProps) {
  const [index, setIndex] = useState(0)
  if (hints.length === 0) return null

  const current = hints[index]!
  const total = hints.length
  const prev = () => setIndex(i => (i - 1 + total) % total)
  const next = () => setIndex(i => (i + 1) % total)

  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <LightbulbIcon className='h-4 w-4 text-primary' />
            <CardTitle className='text-base'>Tips for you</CardTitle>
          </div>
          {/* Prev / Next + counter */}
          <div className='flex items-center gap-0.5'>
            <span className='text-xs text-muted-foreground mr-1 tabular-nums'>
              {index + 1} / {total}
            </span>
            <button
              type='button'
              onClick={prev}
              className='rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors'
              aria-label='Previous tip'
            >
              <ChevronLeftIcon className='h-4 w-4' />
            </button>
            <button
              type='button'
              onClick={next}
              className='rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors'
              aria-label='Next tip'
            >
              <ChevronRightIcon className='h-4 w-4' />
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className='space-y-3'>
        {/* Tip content */}
        <div className='relative rounded-lg bg-muted/30 px-4 py-3'>
          <div className='absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-primary/60' />
          <p className='text-sm font-medium text-foreground pl-3 leading-snug'>{current.title}</p>
          <p className='text-sm text-muted-foreground pl-3 mt-1.5 leading-relaxed'>{current.body}</p>
        </div>

        {/* Dot indicators */}
        {total > 1 && (
          <div className='flex items-center gap-1.5'>
            {hints.map((h, i) => (
              <button
                key={h.id}
                type='button'
                onClick={() => setIndex(i)}
                aria-label={`Go to tip ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50'}`}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// WelcomeBanner
// ---------------------------------------------------------------------------

function getGreeting(): { text: string; emoji: string } {
  const hour = new Date().getHours()
  if (hour < 12) return { text: 'Good morning', emoji: '☀️' }
  if (hour < 17) return { text: 'Good afternoon', emoji: '👋' }
  return { text: 'Good evening', emoji: '🌙' }
}

interface WelcomeBannerProps {
  name?: string
  businessName?: string
}

function WelcomeBanner({ name, businessName }: WelcomeBannerProps) {
  const { text, emoji } = getGreeting()
  const firstName = name?.split(' ')[0]

  return (
    <div className='relative overflow-hidden rounded-2xl border bg-card px-6 py-5 shadow-sm'>
      {/* Decorative blurred orbs — emerald tinted, very subtle */}
      <div className='pointer-events-none absolute -top-6 -right-6 h-32 w-32 rounded-full bg-primary/10 blur-2xl' />
      <div className='pointer-events-none absolute bottom-0 left-1/3 h-20 w-20 rounded-full bg-primary/10 blur-2xl' />
      {/* Dot-grid overlay */}
      <div
        className='pointer-events-none absolute inset-0 opacity-[0.035]'
        style={{
          backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      <div className='relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        {/* Left: greeting */}
        <div className='flex items-start gap-3'>
          <span className='text-3xl leading-none select-none mt-0.5'>{emoji}</span>
          <div>
            <h1 className='text-xl font-semibold tracking-tight text-foreground'>
              {text}
              {firstName ? `, ${firstName}` : ''}!
            </h1>
            <p className='text-sm text-muted-foreground mt-0.5'>
              {businessName ? `Here's what's happening at ${businessName} today.` : "Here's an overview of your store."}
            </p>
          </div>
        </div>

        {/* Right: help CTA */}
        <Link
          to='/contact-us'
          className='inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border bg-muted/50 hover:bg-muted transition-colors px-3.5 py-1.5 text-sm font-medium text-foreground shrink-0'
        >
          <LifeBuoyIcon className='h-3.5 w-3.5 text-primary' />
          Need help?
        </Link>
      </div>

      {/* Bottom row: sparkle tagline */}
      <div className='relative mt-4 flex items-center gap-1.5 text-xs text-muted-foreground'>
        <SparklesIcon className='h-3 w-3 text-primary' />
        <span>You have 50 free transactions to get started — no card required.</span>
      </div>
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
