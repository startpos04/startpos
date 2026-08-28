/**
 * settings/entitlements — Branch-level feature configuration
 *
 * Shows which capabilities are enabled at the business level with their
 * corresponding entitlement details (usage limits, current usage, etc.)
 *
 * Features:
 *   - List all plan entitlements with usage limits and current usage
 *   - Show capability state (enabled/disabled)
 *   - Show entitlement overrides if any
 *   - Future: Allow branch-level configuration
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { AlertCircle, CheckCircle, Info, Lock, Settings, Shield, TrendingUp, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { fetchEntitlementDetails } from '@/lib/server-fn/fetch-entitlement-details'
import { toggleBranchCapability } from '@/lib/server-fn/toggle-branch-capability'

export const Route = createFileRoute('/(private)/(dashboard)/settings/-entitlements/')({
  component: EntitlementsPage,
})

/**
 * Branch Entitlements Page
 *
 * Shows all plan entitlements with their corresponding limits, usage, and state.
 * Future: Will allow branch-level configuration of features.
 */
export function EntitlementsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['entitlement-details'],
    queryFn: () => fetchEntitlementDetails(),
  })

  if (isLoading) {
    return (
      <div className='flex flex-col gap-6 p-6'>
        <Skeleton className='h-8 w-64' />
        <Skeleton className='h-32 w-full' />
        <Skeleton className='h-96 w-full' />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className='flex items-center justify-center h-full p-6'>
        <Card>
          <CardContent className='pt-6'>
            <p className='text-muted-foreground'>Failed to load entitlement information</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { planName, status, billingModel, includedTxPerMonth, txUsedThisPeriod, txRemaining, categoryGroups } = data

  return (
    <div className='flex flex-col gap-6 pb-6 px-4 max-w-5xl'>
      {/* Header */}
      <div className='flex flex-col gap-2'>
        <h1 className='text-2xl font-semibold tracking-tight'>Entitlements</h1>
        <p className='text-muted-foreground'>View your enabled capabilities grouped by category. Each capability may have usage limits based on your plan.</p>
      </div>

      {/* Subscription Overview */}
      <Card>
        <CardHeader>
          <CardTitle className='text-lg'>Subscription Overview</CardTitle>
          <CardDescription>Current plan and transaction usage</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='flex flex-wrap items-center gap-4'>
            <div className='flex items-center gap-2'>
              <span className='text-sm font-medium'>Plan:</span>
              <Badge variant='default'>{planName || 'No Plan'}</Badge>
            </div>
            <div className='flex items-center gap-2'>
              <span className='text-sm font-medium'>Status:</span>
              <Badge variant={status === 'ACTIVE' || status === 'TRIAL' ? 'default' : 'destructive'}>{status}</Badge>
            </div>
            <div className='flex items-center gap-2'>
              <span className='text-sm font-medium'>Billing:</span>
              <Badge variant='outline'>{billingModel}</Badge>
            </div>
          </div>

          {/* Transaction Usage */}
          {includedTxPerMonth !== null && includedTxPerMonth !== -1 && (
            <div className='space-y-2'>
              <div className='flex items-center justify-between text-sm'>
                <span className='font-medium'>Transaction Usage</span>
                <span className='text-muted-foreground'>
                  {txUsedThisPeriod.toLocaleString()} / {includedTxPerMonth.toLocaleString()}
                </span>
              </div>
              <Progress value={(txUsedThisPeriod / includedTxPerMonth) * 100} className='h-2' />
              <p className='text-xs text-muted-foreground'>
                {txRemaining !== null ? `${txRemaining.toLocaleString()} transactions remaining this period` : 'Unlimited transactions'}
              </p>
            </div>
          )}
          {includedTxPerMonth === -1 && (
            <div className='flex items-center gap-2 text-sm text-muted-foreground'>
              <Info className='h-4 w-4' />
              <span>Unlimited transactions included in your plan</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category Groups */}
      {categoryGroups.map(group => (
        <Card key={group.category}>
          <CardHeader>
            <CardTitle className='text-lg flex items-center gap-2'>
              {group.isOperational ? <TrendingUp className='h-5 w-5' /> : <Shield className='h-5 w-5' />}
              {group.categoryLabel}
            </CardTitle>
            <CardDescription>
              {group.isOperational ? 'Core business operations - blocked when subscription lapses' : 'Always accessible features'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='space-y-3'>
              {group.entitlements.map(ent => (
                <EntitlementRow key={ent.capabilityKey} entitlement={ent} />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {categoryGroups.length === 0 && (
        <Card>
          <CardContent className='pt-6'>
            <div className='text-center text-muted-foreground'>
              <p>No enabled capabilities found.</p>
              <p className='text-sm mt-2'>Contact your administrator to enable features.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upgrade CTA */}
      <Card className='border-muted'>
        <CardContent className='pt-6'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-3'>
              <div className='rounded-full bg-primary/10 p-2'>
                <Lock className='h-5 w-5 text-primary' />
              </div>
              <div>
                <p className='text-sm font-medium'>Need more features or higher limits?</p>
                <p className='text-xs text-muted-foreground'>Upgrade your plan to unlock additional capabilities</p>
              </div>
            </div>
            <Button variant='outline' size='sm' asChild>
              <a href='/business/billing'>View Plans</a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Note about branch-specific settings */}
      <Card className='bg-muted/50'>
        <CardContent className='pt-6'>
          <div className='flex gap-3'>
            <Settings className='h-5 w-5 text-muted-foreground shrink-0 mt-0.5' />
            <div className='space-y-1'>
              <p className='text-sm font-medium'>Branch-Level Control</p>
              <p className='text-sm text-muted-foreground'>
                Use the toggles above to enable or disable specific capabilities for this branch. Disabled capabilities won't be accessible to users at this
                branch, even if they're enabled business-wide. This is useful for controlling feature rollout or temporarily disabling features per location.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Entitlement Row Component - Shows a single entitlement with all its details
 */
function EntitlementRow({ entitlement }: { entitlement: import('@/lib/server-fn/fetch-entitlement-details').EntitlementDetail }) {
  const queryClient = useQueryClient()

  const {
    capabilityKey,
    featureLabel,
    featureDescription,
    isEnabled,
    isEnabledAtBranch,
    usageLimit,
    currentUsage,
    hasOverride,
    overrideGranted,
    overrideExpiresAt,
    overrideReason,
  } = entitlement

  const usagePercentage = usageLimit && currentUsage !== null ? (currentUsage / usageLimit) * 100 : 0
  const isNearLimit = usagePercentage >= 80
  const isAtLimit = usageLimit !== null && currentUsage !== null && currentUsage >= usageLimit

  // Mutation to toggle capability
  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => toggleBranchCapability({ data: { capabilityKey, enabled } }),
    onSuccess: async result => {
      if (result.success) {
        toast.success(result.message || 'Capability updated')
        // Invalidate the entitlement details query to refresh the UI
        await queryClient.invalidateQueries({ queryKey: ['entitlement-details'] })
      } else {
        toast.error(result.message || 'Failed to update capability')
      }
    },
    onError: error => {
      console.error('[EntitlementRow] Toggle error:', error)
      toast.error('Failed to update capability')
    },
  })

  const handleToggle = (checked: boolean) => {
    toggleMutation.mutate(checked)
  }

  return (
    <div className='flex flex-col gap-3 p-4 rounded-lg border bg-card'>
      {/* Header Row */}
      <div className='flex items-start justify-between gap-4'>
        <div className='flex items-start gap-3 flex-1'>
          {isEnabled && isEnabledAtBranch ? (
            <CheckCircle className='h-5 w-5 text-green-600 shrink-0 mt-0.5' />
          ) : (
            <XCircle className='h-5 w-5 text-muted-foreground shrink-0 mt-0.5' />
          )}
          <div className='flex-1 min-w-0'>
            <div className='flex items-center gap-2 flex-wrap'>
              <p className='text-sm font-medium'>{featureLabel}</p>
              {!isEnabledAtBranch && (
                <Badge variant='outline' className='text-xs text-muted-foreground'>
                  Disabled at branch
                </Badge>
              )}
              {hasOverride && (
                <Badge variant='outline' className='text-xs'>
                  Override
                </Badge>
              )}
            </div>
            {featureDescription && <p className='text-xs text-muted-foreground mt-1'>{featureDescription}</p>}
          </div>
        </div>
        {/* Toggle - Controls branch-level enable/disable */}
        <div className='flex items-center gap-2 shrink-0'>
          <Switch
            checked={isEnabledAtBranch}
            onCheckedChange={handleToggle}
            disabled={toggleMutation.isPending}
            title='Enable or disable this capability for this branch'
          />
        </div>
      </div>

      {/* Usage Limits Section - Only show if enabled at branch */}
      {isEnabledAtBranch && usageLimit !== null && (
        <div className='space-y-2 pl-8'>
          <div className='flex items-center justify-between text-sm'>
            <span className='text-muted-foreground'>Usage Limit</span>
            <span className={`font-medium tabular-nums ${isAtLimit ? 'text-destructive' : isNearLimit ? 'text-amber-600' : ''}`}>
              {currentUsage ?? 0} / {usageLimit}
            </span>
          </div>
          <Progress value={usagePercentage} className={`h-1.5 ${isAtLimit ? '[&>div]:bg-destructive' : isNearLimit ? '[&>div]:bg-amber-500' : ''}`} />
          {isAtLimit && (
            <div className='flex items-center gap-2 text-xs text-destructive'>
              <AlertCircle className='h-3.5 w-3.5' />
              <span>Limit reached. Upgrade your plan to add more.</span>
            </div>
          )}
          {isNearLimit && !isAtLimit && (
            <div className='flex items-center gap-2 text-xs text-amber-600'>
              <AlertCircle className='h-3.5 w-3.5' />
              <span>Approaching limit. Consider upgrading your plan.</span>
            </div>
          )}
        </div>
      )}

      {/* Unlimited indicator - Only show if enabled at branch */}
      {isEnabledAtBranch && usageLimit === null && (
        <div className='pl-8'>
          <div className='flex items-center gap-2 text-xs text-muted-foreground'>
            <Info className='h-3.5 w-3.5' />
            <span>Unlimited usage</span>
          </div>
        </div>
      )}

      {/* Disabled message */}
      {!isEnabledAtBranch && (
        <div className='pl-8'>
          <div className='flex items-center gap-2 text-xs text-muted-foreground'>
            <Info className='h-3.5 w-3.5' />
            <span>This capability is disabled for this branch. Toggle it on to use it.</span>
          </div>
        </div>
      )}

      {/* Override Info */}
      {hasOverride && (
        <div className='pl-8 pt-2 border-t'>
          <div className='space-y-1'>
            <div className='flex items-center gap-2 text-xs'>
              <Badge variant={overrideGranted ? 'default' : 'destructive'} className='text-xs'>
                {overrideGranted ? 'Granted' : 'Revoked'}
              </Badge>
              {overrideExpiresAt && <span className='text-muted-foreground'>Expires: {new Date(overrideExpiresAt).toLocaleDateString()}</span>}
            </div>
            {overrideReason && <p className='text-xs text-muted-foreground italic'>{overrideReason}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Format capability key to human-readable name
 */
function formatFeatureName(key: string): string {
  // Convert SCREAMING_SNAKE_CASE to Title Case
  return key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
