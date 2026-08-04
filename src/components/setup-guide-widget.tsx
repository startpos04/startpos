/**
 * setup-guide-widget.tsx
 *
 * SetupGuideWidget — Stripe-style floating setup guide.
 *
 * Behaviour:
 *   - Renders as a small FAB-style button in the bottom-right corner when collapsed.
 *   - Expands into a panel showing all tutorial groups and their items.
 *   - Groups are individually collapsible (accordion-style).
 *   - Completed items show a filled check circle; pending items show an open circle
 *     dot; items whose group is fully done are dimmed.
 *   - A progress bar under the header title fills as items are resolved.
 *   - Open/collapsed state is persisted in sessionStorage so it survives
 *     navigation within the same session but resets on next login.
 *   - Hidden once every single tutorial item is resolved (all-done state).
 *
 * Architecture:
 *   - Accepts a TutorialContext prop — zero extra data-fetching inside.
 *   - Reads from TutorialEngine.evaluateAll('dashboard', context) — same data
 *     as SetupChecklist, but used to drive a floating overlay.
 *   - No dependency on TutorialStore (dismissed state) — the widget shows the
 *     authoritative completion picture, not a filtered-by-dismissal view.
 */

import { Link } from '@tanstack/react-router'
import { CheckCircle2Icon, ChevronDownIcon, ChevronUpIcon, CircleIcon, XIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { TutorialEngine } from '@/lib/tutorial/tutorial-engine'
import { type TutorialContext, TutorialGroup } from '@/lib/tutorial/tutorial-types'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'setup-guide-open'
const STORAGE_EXPANDED_KEY = 'setup-guide-expanded-groups'

const GROUP_LABELS: Record<TutorialGroup, string> = {
  [TutorialGroup.SETUP]: 'Setup',
  [TutorialGroup.POS]: 'Point of Sale',
  [TutorialGroup.INVENTORY]: 'Inventory',
  [TutorialGroup.BILLING]: 'Billing',
  [TutorialGroup.EMPLOYEES]: 'Team',
  [TutorialGroup.REPORTS]: 'Reports',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readStorage(key: string, fallback: string): string {
  try {
    return sessionStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function writeStorage(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // ignore — storage unavailable (private mode, etc.)
  }
}

// ---------------------------------------------------------------------------
// SetupGuideWidget
// ---------------------------------------------------------------------------

interface SetupGuideWidgetProps {
  context: TutorialContext
}

export function SetupGuideWidget({ context }: SetupGuideWidgetProps) {
  const allItems = TutorialEngine.evaluateAll('dashboard', context)

  const totalCount = allItems.length
  const resolvedCount = allItems.filter(i => i.resolved).length
  const unresolvedCount = totalCount - resolvedCount
  const progressPct = totalCount === 0 ? 100 : Math.round((resolvedCount / totalCount) * 100)
  const isAllDone = unresolvedCount === 0

  // Persist open state in sessionStorage
  const [isOpen, setIsOpen] = useState(() => readStorage(STORAGE_KEY, 'false') === 'true')

  // Which groups are expanded (open) — default: first group with unresolved items
  const [expandedGroups, setExpandedGroups] = useState<Set<TutorialGroup>>(() => {
    const saved = readStorage(STORAGE_EXPANDED_KEY, '')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) return new Set<TutorialGroup>(parsed)
      } catch {
        // fall through to default
      }
    }
    // Default: expand the first group that has unresolved items
    const firstUnresolved = Object.values(TutorialGroup).find(g => allItems.some(i => i.group === g && !i.resolved))
    return firstUnresolved ? new Set<TutorialGroup>([firstUnresolved]) : new Set<TutorialGroup>()
  })

  // Sync state to sessionStorage
  useEffect(() => {
    writeStorage(STORAGE_KEY, isOpen ? 'true' : 'false')
  }, [isOpen])

  useEffect(() => {
    writeStorage(STORAGE_EXPANDED_KEY, JSON.stringify([...expandedGroups]))
  }, [expandedGroups])

  // Don't render at all once fully complete
  if (isAllDone) return null

  function toggleGroup(group: TutorialGroup) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  // Build grouped items — only include groups that have at least one item
  const grouped = Object.values(TutorialGroup)
    .map(group => ({
      group,
      label: GROUP_LABELS[group],
      items: allItems.filter(i => i.group === group),
    }))
    .filter(g => g.items.length > 0)

  // ---------------------------------------------------------------------------
  // Collapsed FAB
  // ---------------------------------------------------------------------------
  if (!isOpen) {
    return (
      <button
        type='button'
        onClick={() => setIsOpen(true)}
        className={cn(
          'fixed bottom-4 right-4 z-50',
          'flex items-center gap-2.5 rounded-full',
          'bg-background border border-border shadow-lg',
          'px-4 py-2.5 text-sm font-medium text-foreground',
          'hover:bg-accent transition-colors duration-150',
          'animate-in slide-in-from-bottom-4 fade-in-0 duration-200',
        )}
        aria-label='Open setup guide'
      >
        {/* Mini circular progress indicator */}
        <MiniProgress pct={progressPct} resolved={resolvedCount} total={totalCount} />
        <span>Setup guide</span>
        <ChevronUpIcon className='h-3.5 w-3.5 text-muted-foreground' />
      </button>
    )
  }

  // ---------------------------------------------------------------------------
  // Expanded panel
  // ---------------------------------------------------------------------------
  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50',
        'w-80 rounded-xl border border-border bg-background shadow-xl',
        'animate-in slide-in-from-bottom-4 fade-in-0 duration-200',
        'flex flex-col overflow-hidden',
        'max-h-[calc(100vh-2rem)]',
      )}
      role='dialog'
      aria-label='Setup guide'
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className='flex items-center justify-between px-4 pt-4 pb-2 shrink-0'>
        <span className='text-sm font-semibold text-foreground'>Setup guide</span>
        <button
          type='button'
          onClick={() => setIsOpen(false)}
          className='text-muted-foreground hover:text-foreground transition-colors'
          aria-label='Close setup guide'
        >
          <XIcon className='h-4 w-4' />
        </button>
      </div>

      {/* ── Progress bar ────────────────────────────────────────────────── */}
      <div className='px-4 pb-3 shrink-0'>
        <div className='flex items-center justify-between mb-1.5'>
          <span className='text-xs text-muted-foreground'>
            {resolvedCount} of {totalCount} complete
          </span>
          <span className='text-xs font-medium text-primary'>{progressPct}%</span>
        </div>
        <div className='h-1 w-full rounded-full bg-muted overflow-hidden'>
          <div
            className='h-full rounded-full bg-primary transition-all duration-500'
            style={{ width: `${progressPct}%` }}
            role='progressbar'
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {/* Divider */}
      <div className='border-t border-border mx-0 shrink-0' />

      {/* ── Groups (scrollable) ──────────────────────────────────────────── */}
      <div className='overflow-y-auto flex-1'>
        {grouped.map(({ group, label, items }) => {
          const groupResolved = items.filter(i => i.resolved).length
          const groupTotal = items.length
          const groupDone = groupResolved === groupTotal
          const isExpanded = expandedGroups.has(group)

          return (
            <div key={group} className='border-b border-border last:border-b-0'>
              {/* Group header — accordion trigger */}
              <button
                type='button'
                onClick={() => toggleGroup(group)}
                className={cn('w-full flex items-center justify-between px-4 py-3 text-left', 'hover:bg-accent/50 transition-colors duration-100')}
                aria-expanded={isExpanded}
              >
                <div className='flex items-center gap-2.5'>
                  {/* Group-level status icon */}
                  {groupDone ? (
                    <CheckCircle2Icon className='h-4 w-4 shrink-0 text-primary' />
                  ) : (
                    <div className='h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/40' />
                  )}
                  <span className={cn('text-sm font-medium', groupDone ? 'text-muted-foreground' : 'text-foreground')}>{label}</span>
                </div>
                {isExpanded ? (
                  <ChevronUpIcon className='h-3.5 w-3.5 text-muted-foreground shrink-0' />
                ) : (
                  <ChevronDownIcon className='h-3.5 w-3.5 text-muted-foreground shrink-0' />
                )}
              </button>

              {/* Group items — collapsible */}
              {isExpanded && (
                <ul className='pb-2'>
                  {items.map(item => (
                    <GuideItem key={item.id} item={item} />
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// GuideItem — a single checklist row inside a group
// ---------------------------------------------------------------------------

interface GuideItemProps {
  item: {
    id: string
    title: string
    ctaRoute: string
    resolved: boolean
  }
}

function GuideItem({ item }: GuideItemProps) {
  const content = (
    <li className={cn('flex items-center gap-3 px-4 py-2', !item.resolved && 'hover:bg-accent/40 cursor-pointer', item.resolved && 'opacity-60')}>
      {item.resolved ? <CheckCircle2Icon className='h-4 w-4 shrink-0 text-primary' /> : <CircleIcon className='h-4 w-4 shrink-0 text-muted-foreground/50' />}
      <span className={cn('text-sm leading-snug', item.resolved ? 'line-through text-muted-foreground' : 'text-foreground')}>{item.title}</span>
    </li>
  )

  if (item.resolved) return content

  return (
    <Link to={item.ctaRoute} className='block'>
      {content}
    </Link>
  )
}

// ---------------------------------------------------------------------------
// MiniProgress — tiny SVG ring that sits in the collapsed FAB
// ---------------------------------------------------------------------------

interface MiniProgressProps {
  pct: number
  resolved: number
  total: number
}

function MiniProgress({ pct }: MiniProgressProps) {
  const r = 9
  const circumference = 2 * Math.PI * r
  const offset = circumference - (pct / 100) * circumference

  return (
    <span className='relative flex items-center justify-center w-6 h-6'>
      <svg className='w-6 h-6 -rotate-90' viewBox='0 0 24 24' aria-hidden='true'>
        {/* Track */}
        <circle cx='12' cy='12' r={r} fill='none' stroke='currentColor' strokeWidth='2' className='text-muted-foreground/25' />
        {/* Fill */}
        <circle
          cx='12'
          cy='12'
          r={r}
          fill='none'
          stroke='currentColor'
          strokeWidth='2'
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap='round'
          className='text-primary transition-all duration-500'
        />
      </svg>
    </span>
  )
}
