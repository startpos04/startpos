/**
 * Capability Details Sidebar
 *
 * Side drawer that shows detailed information about a capability including
 * usage limits, override details, and the ability to toggle it on/off.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle, Info, Lock, Shield, TrendingUp, X, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import type { EntitlementDetail } from '@/lib/server-fn/fetch-entitlement-details'
import { toggleBranchCapability } from '@/lib/server-fn/toggle-branch-capability'
import { closeCapabilitySidebar } from './capability-sidebar'

interface CapabilityDetailsSidebarProps {
  capability: EntitlementDetail
  onClose?: () => void
}

export function CapabilityDetailsSidebar({ capability, onClose }: CapabilityDetailsSidebarProps) {
  const queryClient = useQueryClient()
  const handleClose = onClose ?? closeCapabilitySidebar

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
  } = capability

  const usagePercentage = usageLimit && currentUsage !== null ? (currentUsage / usageLimit) * 100 : 0
  const isNearLimit = usagePercentage >= 80
  const isAtLimit = usageLimit !== null && currentUsage !== null && currentUsage >= usageLimit

  // Determine if operational based on capability key patterns
  const isOperational = capabilityKey.includes('TRANSACTION') || capabilityKey.includes('INVENTORY')

  // Mutation to toggle capability
  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => toggleBranchCapability({ data: { capabilityKey, enabled } }),
    onSuccess: async result => {
      if (result.success) {
        toast.success(result.message || 'Capability updated')
        await queryClient.invalidateQueries({ queryKey: ['entitlement-details'] })
      } else {
        toast.error(result.message || 'Failed to update capability')
      }
    },
    onError: error => {
      console.error('[CapabilityDetailsSidebar] Toggle error:', error)
      toast.error('Failed to update capability')
    },
  })

  const handleToggle = (checked: boolean) => {
    toggleMutation.mutate(checked)
  }

  return (
    <div className='flex flex-col h-full'>
      {/* Header */}
      <div className='flex items-start justify-between p-4 border-b shrink-0'>
        <div className='flex gap-3'>
          <div className='h-10 w-10 rounded-xl border shadow-sm shrink-0 flex items-center justify-center bg-primary/10'>
            {isOperational ? <TrendingUp className='h-5 w-5 text-primary' /> : <Shield className='h-5 w-5 text-primary' />}
          </div>
          <div>
            <div className='flex items-center gap-2 flex-wrap'>
              <h2 className='text-base font-semibold leading-tight'>{featureLabel}</h2>
            </div>
            <div className='flex gap-1.5 mt-1 flex-wrap'>
              <Badge variant='outline' className='text-[10px] py-0 h-4'>
                {isOperational ? 'Operational' : 'Platform'}
              </Badge>
              {hasOverride && (
                <Badge variant='outline' className='text-[10px] py-0 h-4'>
                  Override
                </Badge>
              )}
            </div>
            {featureDescription && <p className='text-xs text-muted-foreground mt-1.5'>{featureDescription}</p>}
          </div>
        </div>
        <Button variant='ghost' size='icon' onClick={handleClose} className='h-7 w-7 shrink-0'>
          <X className='size-4' />
        </Button>
      </div>

      {/* Content */}
      <div className='flex-1 overflow-y-auto'>
        <div className='p-4 space-y-6'>
          {/* Status Section */}
          <div className='space-y-3'>
            <h3 className='text-sm font-semibold'>Status</h3>
            <div className='flex items-center justify-between p-3 rounded-lg border bg-card'>
              <div className='flex items-center gap-3'>
                {isEnabledAtBranch ? (
                  <CheckCircle className='h-5 w-5 text-green-600' />
                ) : (
                  <XCircle className='h-5 w-5 text-muted-foreground' />
                )}
                <div>
                  <p className='text-sm font-medium'>{isEnabledAtBranch ? 'Enabled at Branch' : 'Disabled at Branch'}</p>
                  <p className='text-xs text-muted-foreground'>
                    {isEnabledAtBranch
                      ? 'This capability is active for this branch'
                      : 'This capability is disabled for this branch'}
                  </p>
                </div>
              </div>
              <Switch
                checked={isEnabledAtBranch}
                onCheckedChange={handleToggle}
                disabled={toggleMutation.isPending}
              />
            </div>
          </div>

          <Separator />

          {/* Usage Section */}
          {isEnabledAtBranch && (
            <>
              <div className='space-y-3'>
                <h3 className='text-sm font-semibold'>Usage & Limits</h3>
                
                {usageLimit !== null ? (
                  <div className='p-3 rounded-lg border bg-card space-y-3'>
                    <div className='flex items-center justify-between text-sm'>
                      <span className='text-muted-foreground'>Current Usage</span>
                      <span className={`font-semibold tabular-nums ${isAtLimit ? 'text-destructive' : isNearLimit ? 'text-amber-600' : ''}`}>
                        {currentUsage ?? 0} / {usageLimit}
                      </span>
                    </div>
                    <Progress
                      value={usagePercentage}
                      className={`h-2 ${isAtLimit ? '[&>div]:bg-destructive' : isNearLimit ? '[&>div]:bg-amber-500' : ''}`}
                    />
                    {isAtLimit && (
                      <div className='flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded p-2'>
                        <AlertCircle className='h-4 w-4 shrink-0' />
                        <span>You've reached your usage limit. Upgrade your plan to add more capacity.</span>
                      </div>
                    )}
                    {isNearLimit && !isAtLimit && (
                      <div className='flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950 rounded p-2'>
                        <AlertCircle className='h-4 w-4 shrink-0' />
                        <span>You're approaching your usage limit. Consider upgrading your plan.</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className='p-3 rounded-lg border bg-card'>
                    <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                      <Info className='h-4 w-4' />
                      <span>Unlimited usage included in your plan</span>
                    </div>
                  </div>
                )}
              </div>

              <Separator />
            </>
          )}

          {/* Override Information */}
          {hasOverride && (
            <>
              <div className='space-y-3'>
                <h3 className='text-sm font-semibold'>Override Details</h3>
                <div className='p-3 rounded-lg border bg-card space-y-3'>
                  <div className='flex items-center gap-2'>
                    <Badge variant={overrideGranted ? 'default' : 'destructive'}>
                      {overrideGranted ? 'Granted' : 'Revoked'}
                    </Badge>
                    {overrideExpiresAt && (
                      <span className='text-xs text-muted-foreground'>
                        Expires: {new Date(overrideExpiresAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {overrideReason && (
                    <div className='text-sm'>
                      <p className='text-muted-foreground text-xs mb-1'>Reason:</p>
                      <p className='text-sm italic'>{overrideReason}</p>
                    </div>
                  )}
                  <div className='flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded p-2'>
                    <Info className='h-4 w-4 shrink-0 mt-0.5' />
                    <span>
                      Overrides are special permissions granted or revoked for this capability outside of your plan's normal limits.
                    </span>
                  </div>
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Technical Details */}
          <div className='space-y-3'>
            <h3 className='text-sm font-semibold'>Technical Details</h3>
            <div className='p-3 rounded-lg border bg-card space-y-2'>
              <div className='flex justify-between text-sm'>
                <span className='text-muted-foreground'>Capability Key</span>
                <code className='text-xs bg-muted px-2 py-1 rounded'>{capabilityKey}</code>
              </div>
              <div className='flex justify-between text-sm'>
                <span className='text-muted-foreground'>Type</span>
                <span className='text-sm font-medium'>{isOperational ? 'Operational' : 'Platform'}</span>
              </div>
              <div className='flex justify-between text-sm'>
                <span className='text-muted-foreground'>Business-wide Status</span>
                <span className='text-sm font-medium'>{isEnabled ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className='p-3 rounded-lg bg-muted/50 space-y-2'>
            <div className='flex gap-2'>
              <Info className='h-4 w-4 text-muted-foreground shrink-0 mt-0.5' />
              <div className='text-xs text-muted-foreground space-y-1'>
                <p>
                  <strong>Branch-Level Control:</strong> Use the toggle above to enable or disable this capability specifically for this branch.
                </p>
                <p>
                  When disabled, users at this branch won't have access to this feature, even if it's enabled business-wide.
                </p>
              </div>
            </div>
          </div>

          {/* Upgrade CTA */}
          {isAtLimit && (
            <div className='p-3 rounded-lg border border-primary/20 bg-primary/5'>
              <div className='flex items-start gap-3'>
                <div className='rounded-full bg-primary/10 p-2 shrink-0'>
                  <Lock className='h-4 w-4 text-primary' />
                </div>
                <div className='flex-1 space-y-2'>
                  <p className='text-sm font-medium'>Need more capacity?</p>
                  <p className='text-xs text-muted-foreground'>
                    Upgrade your plan to increase your usage limits and unlock additional features.
                  </p>
                  <Button variant='outline' size='sm' asChild className='mt-2'>
                    <a href='/business/billing'>View Plans</a>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
