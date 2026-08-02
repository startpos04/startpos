/**
 * setup-checklist.tsx
 *
 * SetupChecklist — dashboard view of the Tutorial system.
 *
 * Renders all tutorials from TutorialEngine.evaluateAll('dashboard', context)
 * grouped by TutorialGroup. Each item shows: group, title, resolved/unresolved
 * state, and a CTA link. Shows a "You're all set" completion state when all
 * conditions are resolved.
 *
 * Not dismissable — always visible on /dashboard until all conditions are met.
 * Named SetupChecklist (not TutorialChecklist) because its long-term
 * responsibility is overall setup progress, not just tutorial state.
 */

import { Link } from '@tanstack/react-router'
import { CheckCircle2Icon, ChevronRightIcon, CircleDotIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TutorialEngine } from '@/lib/tutorial/tutorial-engine'
import { type TutorialContext, TutorialGroup } from '@/lib/tutorial/tutorial-types'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Group metadata for display labels
// ---------------------------------------------------------------------------

const GROUP_LABELS: Record<TutorialGroup, string> = {
  [TutorialGroup.SETUP]: 'Setup',
  [TutorialGroup.POS]: 'Point of Sale',
  [TutorialGroup.INVENTORY]: 'Inventory',
  [TutorialGroup.BILLING]: 'Billing',
  [TutorialGroup.EMPLOYEES]: 'Team',
  [TutorialGroup.REPORTS]: 'Reports',
}

// ---------------------------------------------------------------------------
// SetupChecklist
// ---------------------------------------------------------------------------

interface SetupChecklistProps {
  context: TutorialContext
}

export function SetupChecklist({ context }: SetupChecklistProps) {
  const allItems = TutorialEngine.evaluateAll('dashboard', context)

  const unresolvedCount = allItems.filter(i => !i.resolved).length
  const isAllDone = unresolvedCount === 0

  // Group items by TutorialGroup
  const grouped = Object.values(TutorialGroup).reduce<Record<TutorialGroup, typeof allItems>>(
    (acc, group) => {
      acc[group] = allItems.filter(item => item.group === group)
      return acc
    },
    {} as Record<TutorialGroup, typeof allItems>,
  )

  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between'>
          <CardTitle className='text-base'>Setup checklist</CardTitle>
          {!isAllDone && (
            <Badge variant='secondary' className='text-xs'>
              {unresolvedCount} remaining
            </Badge>
          )}
        </div>
        <CardDescription>{isAllDone ? "You're all set! Your store is fully configured." : 'Complete these steps to get your store ready.'}</CardDescription>
      </CardHeader>
      <CardContent className='pt-0'>
        {isAllDone ? (
          <div className='flex items-center gap-2 py-4 text-sm text-muted-foreground'>
            <CheckCircle2Icon className='h-5 w-5 text-green-500' />
            <span>Everything is configured. You're ready to sell.</span>
          </div>
        ) : (
          <div className='space-y-4'>
            {(Object.entries(grouped) as [TutorialGroup, typeof allItems][]).map(([group, items]) => {
              if (items.length === 0) return null
              const groupUnresolved = items.filter(i => !i.resolved).length

              return (
                <div key={group}>
                  <div className='flex items-center gap-2 mb-2'>
                    <span className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>{GROUP_LABELS[group]}</span>
                    {groupUnresolved === 0 && <CheckCircle2Icon className='h-3.5 w-3.5 text-green-500' />}
                  </div>
                  <div className='space-y-1'>
                    {items.map(item => (
                      <ChecklistItem key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// ChecklistItem
// ---------------------------------------------------------------------------

interface ChecklistItemProps {
  item: {
    id: string
    title: string
    ctaLabel: string
    ctaRoute: string
    resolved: boolean
  }
}

function ChecklistItem({ item }: ChecklistItemProps) {
  return (
    <div className={cn('flex items-center justify-between rounded-md px-2 py-1.5 text-sm', item.resolved ? 'text-muted-foreground' : 'text-foreground')}>
      <div className='flex items-center gap-2'>
        {item.resolved ? <CheckCircle2Icon className='h-4 w-4 shrink-0 text-green-500' /> : <CircleDotIcon className='h-4 w-4 shrink-0 text-primary' />}
        <span className={cn(item.resolved && 'line-through')}>{item.title}</span>
      </div>

      {!item.resolved && (
        <Link to={item.ctaRoute} className='flex items-center gap-0.5 text-xs text-primary hover:underline underline-offset-2 shrink-0'>
          {item.ctaLabel}
          <ChevronRightIcon className='h-3 w-3' />
        </Link>
      )}
    </div>
  )
}
