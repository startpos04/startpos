/**
 * feature-library.tsx
 *
 * FeatureLibrary — feature discovery UI for the dashboard.
 *
 * Replaces SetupChecklist. Shows every optional capability the app offers,
 * written as mini-articles answering:
 *   1. What is this feature?
 *   2. Why does your business need it?
 *   3. How do you enable and use it?
 *
 * Architecture:
 *   - Reads enabledIds and deferredIds from authStore — zero new fetches.
 *   - Calls buildFeatureLibrary() — pure, no IO.
 *   - Filter tabs are local state only (no URL params — this is a dashboard widget).
 *   - Expand/collapse per card is local state.
 *   - Recommended entries show an "Enable now" action using the existing
 *     acceptCapability server function (same as RecommendationCard).
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRightIcon, CheckCircle2Icon, ChevronDownIcon, ChevronUpIcon, ClockIcon, Loader2Icon, SparklesIcon, ZapIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@startpos-core/components/ui/badge'
import { Button } from '@startpos-core/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@startpos-core/components/ui/card'
import type { CapabilityCategory } from '@/lib/onboarding/types'
import { acceptCapability, enableCapability } from '@/lib/server-fn/capability-actions'
import { fetchCapabilityStates } from '@/lib/server-fn/fetch-capability-states'
import { buildFeatureLibrary, CATEGORY_LABELS, CATEGORY_ORDER, type FeatureEntry, type FeatureState } from '@/lib/tutorial/feature-library'
import { cn } from '@startpos-core/lib/utils'
import { refreshAuthUser } from '@startpos-core/lib/better-auth/auth-store'

// ---------------------------------------------------------------------------
// Filter tab type
// ---------------------------------------------------------------------------

type FilterTab = 'recommended' | 'enabled' | 'available' | 'coming_soon'

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'enabled', label: 'Enabled' },
  { id: 'available', label: 'Available' },
  { id: 'coming_soon', label: 'Coming soon' },
]

// ---------------------------------------------------------------------------
// State badge config
// ---------------------------------------------------------------------------

const STATE_CONFIG: Record<FeatureState, { label: string; className: string }> = {
  RECOMMENDED: {
    label: 'Recommended',
    className: 'border-amber-400/60 text-amber-700 bg-amber-50/60 dark:bg-amber-950/30 dark:text-amber-400',
  },
  ENABLED: {
    label: 'Enabled',
    className: 'border-emerald-400/60 text-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/30 dark:text-emerald-400',
  },
  AVAILABLE: {
    label: 'Available',
    className: 'border-border text-muted-foreground bg-muted/30',
  },
  COMING_SOON: {
    label: 'Coming soon',
    className: 'border-border text-muted-foreground/60 bg-muted/20',
  },
}

// ---------------------------------------------------------------------------
// FeatureLibrary
// ---------------------------------------------------------------------------

export function FeatureLibrary() {
  const qc = useQueryClient()
  const [activeFilter, setActiveFilter] = useState<FilterTab>('recommended')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [enablingId, setEnablingId] = useState<string | null>(null)

  const { data: capabilityStates = [], isLoading } = useQuery({
    queryKey: ['capability-states'],
    queryFn: () => fetchCapabilityStates(),
    staleTime: 60_000,
  })

  const allEntries = useMemo(() => buildFeatureLibrary(capabilityStates), [capabilityStates])

  // Filtered entries based on active tab
  const filteredEntries = useMemo(() => {
    if (activeFilter === 'recommended') return allEntries.filter(e => e.state === 'RECOMMENDED')
    if (activeFilter === 'enabled') return allEntries.filter(e => e.state === 'ENABLED')
    if (activeFilter === 'available') return allEntries.filter(e => e.state === 'AVAILABLE')
    if (activeFilter === 'coming_soon') return allEntries.filter(e => e.state === 'COMING_SOON')
    return allEntries
  }, [allEntries, activeFilter])

  // Counts per tab for badges
  const counts = useMemo(
    () => ({
      recommended: allEntries.filter(e => e.state === 'RECOMMENDED').length,
      enabled: allEntries.filter(e => e.state === 'ENABLED').length,
    }),
    [allEntries],
  )

  // Group filtered entries by category in CATEGORY_ORDER
  const grouped = useMemo(() => {
    const map = new Map<CapabilityCategory, FeatureEntry[]>()
    for (const cat of CATEGORY_ORDER) {
      const entries = filteredEntries.filter(e => e.category === cat)
      if (entries.length > 0) map.set(cat, entries)
    }
    return map
  }, [filteredEntries])

  const handleToggle = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id))
  }

  const handleEnable = async (entry: FeatureEntry) => {
    setEnablingId(entry.id)
    try {
      // RECOMMENDED → use accept() (tracks that user acted on a recommendation)
      // AVAILABLE   → use enable() (HIDDEN → ENABLED, may need to create the row first)
      const action =
        entry.state === 'RECOMMENDED' ? acceptCapability({ data: { capabilityId: entry.id } }) : enableCapability({ data: { capabilityId: entry.id } })

      const result = await action
      if (!result.ok) {
        toast.error(result.reason ?? 'Could not enable feature')
        return
      }

      toast.success(`${entry.label} has been enabled`)

      // Refresh the capability state list (feature library cards)
      void qc.invalidateQueries({ queryKey: ['capability-states'] })

      // Refresh authStore so useCapability() hooks update reactively across
      // the whole app without requiring a page reload.
      await refreshAuthUser()
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setEnablingId(null)
    }
  }

  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex flex-col gap-3'>
          <div className='flex items-center justify-between'>
            <CardTitle className='text-base'>Features</CardTitle>
            <span className='text-xs text-muted-foreground'>
              {counts.enabled} enabled · {allEntries.length} total
            </span>
          </div>

          {/* Filter tabs */}
          <div className='flex gap-1 flex-wrap'>
            {FILTER_TABS.map(tab => {
              const isActive = activeFilter === tab.id
              const count = tab.id === 'recommended' ? counts.recommended : tab.id === 'enabled' ? counts.enabled : null

              return (
                <button
                  key={tab.id}
                  type='button'
                  onClick={() => setActiveFilter(tab.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  )}
                >
                  {tab.label}
                  {count != null && count > 0 && (
                    <span
                      className={cn(
                        'inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold',
                        isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </CardHeader>

      <CardContent className='pt-0'>
        {filteredEntries.length === 0 && !isLoading ? (
          <p className='text-sm text-muted-foreground py-4 text-center'>Nothing here yet.</p>
        ) : (
          <div className='space-y-4'>
            {[...grouped.entries()].map(([category, entries]) => (
              <CategorySection
                key={category}
                category={category}
                entries={entries}
                expandedId={expandedId}
                enablingId={enablingId}
                onToggle={handleToggle}
                onEnable={handleEnable}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// CategorySection
// ---------------------------------------------------------------------------

interface CategorySectionProps {
  category: CapabilityCategory
  entries: FeatureEntry[]
  expandedId: string | null
  enablingId: string | null
  onToggle: (id: string) => void
  onEnable: (entry: FeatureEntry) => void
}

function CategorySection({ category, entries, expandedId, enablingId, onToggle, onEnable }: CategorySectionProps) {
  const label = CATEGORY_LABELS[category] ?? category
  return (
    <div>
      <p className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 px-1'>{label}</p>
      <div className='space-y-1'>
        {entries.map(entry => (
          <FeatureCard
            key={entry.id}
            entry={entry}
            isExpanded={expandedId === entry.id}
            isEnabling={enablingId === entry.id}
            onToggle={() => onToggle(entry.id)}
            onEnable={() => onEnable(entry)}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FeatureCard — collapsed row + expandable article
// ---------------------------------------------------------------------------

interface FeatureCardProps {
  entry: FeatureEntry
  isExpanded: boolean
  isEnabling: boolean
  onToggle: () => void
  onEnable: () => void
}

function FeatureCard({ entry, isExpanded, isEnabling, onToggle, onEnable }: FeatureCardProps) {
  const stateConfig = STATE_CONFIG[entry.state]
  const isRecommended = entry.state === 'RECOMMENDED'
  const isEnabled = entry.state === 'ENABLED'
  const isComingSoon = entry.state === 'COMING_SOON'

  return (
    <div
      className={cn(
        'rounded-lg border transition-all duration-150',
        isRecommended && 'border-amber-400/40 bg-amber-50/20 dark:bg-amber-950/10',
        isEnabled && 'border-emerald-400/20 bg-emerald-50/10 dark:bg-emerald-950/10',
        !isRecommended && !isEnabled && 'border-border',
        isExpanded && 'shadow-sm',
      )}
    >
      {/* ── Collapsed row ───────────────────────────────────────────────── */}
      <button type='button' className='w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left' onClick={onToggle}>
        <div className='flex items-center gap-2.5 min-w-0'>
          {/* Icon */}
          <div
            className={cn(
              'w-6 h-6 rounded-md flex items-center justify-center shrink-0',
              isRecommended && 'bg-amber-100 dark:bg-amber-950',
              isEnabled && 'bg-emerald-100 dark:bg-emerald-950',
              !isRecommended && !isEnabled && 'bg-muted',
            )}
          >
            {isEnabled ? (
              <CheckCircle2Icon className='w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400' />
            ) : isRecommended ? (
              <SparklesIcon className='w-3.5 h-3.5 text-amber-600 dark:text-amber-400' />
            ) : (
              <ZapIcon className='w-3.5 h-3.5 text-muted-foreground/50' />
            )}
          </div>

          {/* Label + description */}
          <div className='min-w-0'>
            <p className={cn('text-sm font-medium leading-snug truncate', isComingSoon && 'text-muted-foreground')}>{entry.label}</p>
            <p className='text-[11px] text-muted-foreground leading-snug truncate'>{entry.description}</p>
          </div>
        </div>

        <div className='flex items-center gap-2 shrink-0'>
          {/* State badge */}
          <Badge variant='outline' className={cn('text-[10px] py-0 h-4 font-semibold hidden sm:flex', stateConfig.className)}>
            {stateConfig.label}
          </Badge>

          {/* Expand chevron */}
          {isExpanded ? <ChevronUpIcon className='w-3.5 h-3.5 text-muted-foreground' /> : <ChevronDownIcon className='w-3.5 h-3.5 text-muted-foreground' />}
        </div>
      </button>

      {/* ── Expanded article ─────────────────────────────────────────────── */}
      {isExpanded && (
        <div className='px-3 pb-3 pt-1 border-t border-border/50 space-y-3'>
          {/* What / Why */}
          <div className='space-y-2'>
            <div>
              <p className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5'>What it does</p>
              <p className='text-sm text-foreground leading-snug'>{entry.description}</p>
            </div>
            <div>
              <p className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5'>Why you need it</p>
              <p className='text-sm text-muted-foreground leading-snug'>{entry.businessValue}</p>
            </div>
          </div>

          {/* How-to steps */}
          {entry.howTo.length > 0 && (
            <div>
              <p className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5'>
                {isEnabled ? 'How to use it' : isComingSoon ? 'What to expect' : 'How to set it up'}
              </p>
              <ol className='space-y-2'>
                {entry.howTo.map((step, i) => (
                  <li key={step.label} className='flex items-start gap-2.5'>
                    <span
                      className={cn(
                        'shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5',
                        isComingSoon ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary',
                      )}
                    >
                      {i + 1}
                    </span>
                    <div>
                      <p className='text-xs font-semibold text-foreground leading-snug'>{step.label}</p>
                      <p className='text-xs text-muted-foreground leading-snug mt-0.5'>{step.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Meta row: setup time + plan */}
          <div className='flex items-center gap-3 text-[11px] text-muted-foreground pt-1'>
            {entry.estimatedSetupMinutes > 0 && (
              <span className='flex items-center gap-1'>
                <ClockIcon className='w-3 h-3' />
                {entry.estimatedSetupMinutes} min setup
              </span>
            )}
            {entry.minimumPlan && entry.minimumPlan !== 'any' && <span className='flex items-center gap-1'>Requires {entry.minimumPlan} plan</span>}
            {entry.isComplex && <span className='text-amber-600 bg-amber-50 dark:bg-amber-950 px-1.5 py-0.5 rounded text-[10px]'>Complex setup</span>}
          </div>

          {/* CTA */}
          {!isComingSoon && entry.cta && (
            <div className='flex items-center gap-2 pt-1'>
              {isRecommended ? (
                <>
                  <Button size='sm' className='h-7 text-xs gap-1' onClick={onEnable} disabled={isEnabling}>
                    {isEnabling ? <Loader2Icon className='w-3 h-3 animate-spin' /> : <SparklesIcon className='w-3 h-3' />}
                    Enable now
                  </Button>
                  <Button size='sm' variant='ghost' className='h-7 text-xs' asChild>
                    <Link to={entry.cta.route}>
                      {entry.cta.label}
                      <ArrowRightIcon className='w-3 h-3 ml-1' />
                    </Link>
                  </Button>
                </>
              ) : (
                <Button size='sm' variant='outline' className='h-7 text-xs gap-1' asChild>
                  <Link to={entry.cta.route}>
                    {entry.cta.label}
                    <ArrowRightIcon className='w-3 h-3' />
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
