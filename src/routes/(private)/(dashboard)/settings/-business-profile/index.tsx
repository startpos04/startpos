/**
 * settings/business-profile — Business Profile editor (Phase 4 UI)
 *
 * Shows all 34 BusinessCharacteristics fields in plain business language.
 * Each field displays:
 *   - Current value (formatted for humans)
 *   - Source label ("From your survey" / "Based on your activity" / "Set by you")
 *   - Evidence string when available
 *   - Edit button → inline value picker
 *   - Decayed badge when confidence = 0 (Phase 7 visibility)
 *
 * Stale intent prompts: intent fields that are > 12 months old show
 * "You mentioned this N months ago. Still accurate? [Yes / No]"
 *
 * Current profile and health stage shown in the header.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle, Clock, Edit3, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { correctCharacteristicFn } from '@/lib/queries/capability-actions'
import { fetchBusinessProfile, type ProfileFieldRow } from '@/lib/queries/fetch-business-profile'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Field display helpers
// ---------------------------------------------------------------------------

/** Convert a raw characteristic value to a readable string */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string') {
    // Convert snake_case / kebab-case to Title Case
    return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }
  return String(value)
}

/** Human-readable field labels for all 34 BusinessCharacteristics */
const FIELD_LABELS: Record<string, string> = {
  dailyTransactionVolume: 'Daily transaction volume',
  teamSize: 'Team size',
  locationCount: 'Number of locations',
  sellsPhysicalGoods: 'Sells physical goods',
  sellsPreparedFood: 'Sells food or drinks',
  sellsServices: 'Provides services',
  sellsRawMaterials: 'Supplies raw materials',
  catalogueSize: 'Catalogue size',
  hasProductVariants: 'Has product variants',
  hasProductComponents: 'Has product recipes / components',
  hasPerishables: 'Has perishable products',
  paymentTiming: 'Payment timing',
  requiresTableManagement: 'Uses table management',
  hasOrderCustomization: 'Orders are customized',
  offersDelivery: 'Offers delivery',
  tracksInventory: 'Tracks inventory',
  inventoryCriticality: 'Inventory criticality',
  hasMultipleStockLocations: 'Multiple stock locations',
  usesSuppliers: 'Uses suppliers',
  requiresGoodsReceipt: 'Requires goods receipt',
  hasRegularWaste: 'Has regular waste / disposal',
  hasRoleSeparation: 'Staff have different access levels',
  requiresApprovals: 'Actions require manager approval',
  usesOperationalTasks: 'Uses operational tasks',
  handlesCash: 'Handles cash',
  reconcilesCash: 'Reconciles cash daily',
  isVatRegistered: 'VAT registered',
  taxDisplayMode: 'Tax display mode',
  requiresOfficialReceipts: 'Issues official receipts',
  hasCorporateBuyers: 'Has corporate buyers',
  tracksCustomers: 'Tracks customers',
  hasLoyaltyIntent: 'Plans to offer loyalty programme',
  plansExpansion: 'Plans to expand locations',
  needsExternalIntegrations: 'Needs external integrations',
  intentToAddMoreStaff: 'Intent: add more staff',
  intentToTrackInventory: 'Intent: start tracking inventory',
  intentToManageSuppliers: 'Intent: manage suppliers',
  intentToOfferDelivery: 'Intent: offer delivery',
  intentToOpenMoreLocations: 'Intent: open more locations',
  intentToIntegrateExternalSystems: 'Intent: integrate external systems',
}

// ---------------------------------------------------------------------------
// Section groupings for the UI
// ---------------------------------------------------------------------------

const SECTIONS: { label: string; fields: string[] }[] = [
  { label: 'Scale', fields: ['dailyTransactionVolume', 'teamSize', 'locationCount'] },
  {
    label: 'What you sell',
    fields: [
      'sellsPhysicalGoods',
      'sellsPreparedFood',
      'sellsServices',
      'sellsRawMaterials',
      'catalogueSize',
      'hasProductVariants',
      'hasProductComponents',
      'hasPerishables',
    ],
  },
  { label: 'Sales process', fields: ['paymentTiming', 'requiresTableManagement', 'hasOrderCustomization', 'offersDelivery'] },
  {
    label: 'Inventory',
    fields: ['tracksInventory', 'inventoryCriticality', 'hasMultipleStockLocations', 'usesSuppliers', 'requiresGoodsReceipt', 'hasRegularWaste'],
  },
  { label: 'Team & operations', fields: ['hasRoleSeparation', 'requiresApprovals', 'usesOperationalTasks'] },
  {
    label: 'Finance & compliance',
    fields: ['handlesCash', 'reconcilesCash', 'isVatRegistered', 'taxDisplayMode', 'requiresOfficialReceipts', 'hasCorporateBuyers'],
  },
  { label: 'Customers', fields: ['tracksCustomers', 'hasLoyaltyIntent'] },
  { label: 'Growth', fields: ['plansExpansion', 'needsExternalIntegrations'] },
  {
    label: 'Your plans',
    fields: [
      'intentToAddMoreStaff',
      'intentToTrackInventory',
      'intentToManageSuppliers',
      'intentToOfferDelivery',
      'intentToOpenMoreLocations',
      'intentToIntegrateExternalSystems',
    ],
  },
]

// ---------------------------------------------------------------------------
// Enum option maps — all non-boolean string fields
// ---------------------------------------------------------------------------

const ENUM_OPTIONS: Partial<Record<string, string[]>> = {
  dailyTransactionVolume: ['minimal', 'low', 'medium', 'high'],
  teamSize: ['solo', 'small', 'medium', 'large'],
  locationCount: ['one', 'multiple'],
  catalogueSize: ['tiny', 'small', 'medium', 'large'],
  paymentTiming: ['immediate', 'deferred', 'mixed'],
  inventoryCriticality: ['none', 'relaxed', 'standard', 'strict'],
  taxDisplayMode: ['inclusive', 'exclusive', 'mixed'],
}

// ---------------------------------------------------------------------------
// Field row component
// ---------------------------------------------------------------------------

function FieldRow({ row, onCorrected }: { row: ProfileFieldRow; onCorrected: () => void }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const label = FIELD_LABELS[row.field as string] ?? String(row.field)
  const displayValue = formatValue(row.value)

  // Determine the type of value to render an appropriate picker
  const isBool = typeof row.value === 'boolean'
  const enumOptions = ENUM_OPTIONS[row.field as string]
  const isEnum = !isBool && Array.isArray(enumOptions)

  const correct = async (newValue: unknown) => {
    setSaving(true)
    try {
      const result = await correctCharacteristicFn({
        data: { field: row.field, value: newValue as never },
      })
      if (!result.ok) {
        toast.error(result.reason ?? 'Could not save correction')
      } else {
        toast.success(`${label} updated`)
        onCorrected()
        setEditing(false)
      }
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='flex items-start justify-between gap-3 py-2.5 border-b last:border-0'>
      <div className='flex-1 min-w-0'>
        <div className='flex items-center gap-1.5 flex-wrap'>
          <span className='text-sm font-medium'>{label}</span>
          {row.isDecayed && (
            <Badge variant='outline' className='text-xs text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950'>
              <AlertTriangle className='size-2.5 mr-0.5' />
              Stale
            </Badge>
          )}
        </div>
        <div className='flex items-center gap-2 mt-0.5'>
          <span className={cn('text-xs font-medium', row.source === 'DEFAULT' ? 'text-muted-foreground' : 'text-foreground')}>{displayValue}</span>
          <span className='text-xs text-muted-foreground'>· {row.sourceLabel}</span>
        </div>
        {row.evidence && <p className='text-xs text-muted-foreground mt-0.5 italic'>{row.evidence}</p>}

        {/* Inline boolean picker */}
        {editing && isBool && (
          <div className='flex gap-2 mt-2'>
            <Button size='sm' variant='outline' className='h-7 text-xs' disabled={saving} onClick={() => correct(true)}>
              <CheckCircle className='size-3 mr-1' />
              Yes
            </Button>
            <Button size='sm' variant='outline' className='h-7 text-xs' disabled={saving} onClick={() => correct(false)}>
              No
            </Button>
            <Button size='sm' variant='ghost' className='h-7 text-xs' onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        )}

        {/* Inline enum picker */}
        {editing && isEnum && (
          <div className='flex flex-wrap gap-1.5 mt-2'>
            {enumOptions!.map(opt => (
              <Button
                key={opt}
                size='sm'
                variant={row.value === opt ? 'default' : 'outline'}
                className='h-7 text-xs'
                disabled={saving}
                onClick={() => correct(opt)}
              >
                {formatValue(opt)}
              </Button>
            ))}
            <Button size='sm' variant='ghost' className='h-7 text-xs' onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        )}
      </div>

      {!editing && (
        <Button
          size='sm'
          variant='ghost'
          className='h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-foreground'
          onClick={() => setEditing(true)}
          aria-label={`Edit ${label}`}
        >
          <Edit3 className='size-3.5' />
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function BusinessProfilePage() {
  const qc = useQueryClient()

  const { data: profile, isLoading } = useQuery({
    queryKey: ['business-profile'],
    queryFn: () => fetchBusinessProfile(),
    staleTime: 30_000,
  })

  const refresh = () => void qc.invalidateQueries({ queryKey: ['business-profile'] })

  if (isLoading) {
    return (
      <div className='px-4 py-6 space-y-3'>
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className='h-24 w-full' />
        ))}
      </div>
    )
  }

  const fieldMap = new Map((profile?.characteristics ?? []).map(f => [f.field as string, f]))

  return (
    <div className='px-4 py-4 space-y-4'>
      {/* Header */}
      <div className='flex items-start justify-between'>
        <div>
          <h2 className='text-base font-semibold'>Business Profile</h2>
          <p className='text-xs text-muted-foreground mt-0.5'>How the platform understands your business. Correct anything that's wrong.</p>
        </div>
        <Button variant='ghost' size='sm' className='text-xs gap-1' onClick={refresh}>
          <RefreshCw className='size-3' />
          Refresh
        </Button>
      </div>

      {/* Profile + health stage */}
      {(profile?.currentProfile || profile?.healthStage) && (
        <div className='flex items-center gap-2 text-xs flex-wrap'>
          {profile.currentProfile && (
            <Badge variant='secondary' className='text-xs'>
              Profile: {profile.currentProfile.replace(/_/g, ' ')}
            </Badge>
          )}
          {profile.healthStage && (
            <Badge variant='outline' className='text-xs'>
              {profile.healthStage}
            </Badge>
          )}
        </div>
      )}

      {/* Stale intent prompts — shown at top as priority */}
      {(profile?.staleIntentPrompts ?? []).length > 0 && (
        <Card className='border-amber-200 bg-amber-50 dark:bg-amber-950/20'>
          <CardHeader className='pb-2 pt-3 px-4'>
            <CardTitle className='text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1'>
              <Clock className='size-3.5' />
              Some of your plans may be out of date
            </CardTitle>
          </CardHeader>
          <CardContent className='px-4 pt-0 pb-3 space-y-3'>
            {profile!.staleIntentPrompts.map(prompt => (
              <div key={prompt.field} className='text-sm'>
                <p className='text-muted-foreground'>{prompt.prompt}</p>
                <div className='flex gap-2 mt-1.5'>
                  <Button
                    size='sm'
                    variant='outline'
                    className='h-7 text-xs'
                    onClick={async () => {
                      await correctCharacteristicFn({ data: { field: prompt.field, value: true as never } })
                      toast.success('Updated — still accurate.')
                      refresh()
                    }}
                  >
                    Yes, still accurate
                  </Button>
                  <Button
                    size='sm'
                    variant='ghost'
                    className='h-7 text-xs'
                    onClick={async () => {
                      await correctCharacteristicFn({ data: { field: prompt.field, value: false as never } })
                      toast.success('Got it — cleared.')
                      refresh()
                    }}
                  >
                    No, clear it
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Characteristic sections */}
      {SECTIONS.map(section => {
        const rows = section.fields.map(f => fieldMap.get(f)).filter((r): r is ProfileFieldRow => r !== undefined)

        if (rows.length === 0) return null

        return (
          <Card key={section.label}>
            <CardHeader className='pb-2 pt-3 px-4'>
              <CardTitle className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>{section.label}</CardTitle>
            </CardHeader>
            <CardContent className='px-4 pt-0 pb-1'>
              {rows.map(row => (
                <FieldRow key={row.field as string} row={row} onCorrected={refresh} />
              ))}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
