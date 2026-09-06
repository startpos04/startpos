/**
 * Capability Details Sidebar
 *
 * Side drawer that shows detailed entitlement information for a capability,
 * including usage limits, current usage, override status, and branch toggle.
 */

import { Badge } from '@platform/components/ui/badge'
import { Button } from '@platform/components/ui/button'
import { Progress } from '@platform/components/ui/progress'
import { cn } from '@platform/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Info, Settings, TrendingUp, X } from 'lucide-react'
import { toast } from 'sonner'
import type { EntitlementDetail } from '@/lib/server-fn/fetch-entitlement-details'
import { closeCapabilitySidebar } from './capability-sidebar'

interface CapabilityDetailsSidebarProps {
  capability: EntitlementDetail
  onClose?: () => void
}

const CATEGORY_LABELS: Record<string, string> = {
  SALES: 'Sales',
  INVENTORY: 'Inventory',
  PROCUREMENT: 'Procurement',
  FINANCE: 'Finance',
  OPERATIONS: 'Operations',
  CRM: 'Customers',
  COMPLIANCE: 'Compliance',
  MULTI_BRANCH: 'Multi-branch',
  REPORTING: 'Reports',
  PLATFORM: 'Platform',
}

export function CapabilityDetailsSidebar({ capability, onClose }: CapabilityDetailsSidebarProps) {
  const queryClient = useQueryClient()
  const handleClose = onClose ?? closeCapabilitySidebar

  const usagePct =
    capability.usageLimit !== null && capability.currentUsage !== null ? Math.min((capability.currentUsage / capability.usageLimit) * 100, 100) : null

  const statusLabel = !capability.isEnabled
    ? { label: 'Disabled', variant: 'destructive' as const, className: '' }
    : capability.isEnabledAtBranch
      ? { label: 'Active', variant: 'default' as const, className: 'bg-green-600 hover:bg-green-600 text-white' }
      : { label: 'Paused', variant: 'outline' as const, className: 'text-muted-foreground' }

  return (
    <div className='flex flex-col h-full'>
      {/* Header */}
      <div className='flex items-start justify-between p-4 border-b shrink-0'>
        <div className='flex gap-3 flex-1 min-w-0'>
          <div className='h-10 w-10 rounded-xl border shadow-sm shrink-0 flex items-center justify-center bg-primary/10'>
            <TrendingUp className='h-5 w-5 text-primary' />
          </div>
          <div className='flex-1 min-w-0'>
            <h2 className='text-base font-semibold leading-tight'>{capability.featureLabel}</h2>
            {capability.featureDescription && <p className='text-xs text-muted-foreground mt-0.5 line-clamp-2'>{capability.featureDescription}</p>}
          </div>
        </div>
        <Button variant='ghost' size='icon' onClick={handleClose} className='h-7 w-7 shrink-0'>
          <X className='size-4' />
        </Button>
      </div>

      {/* Content */}
      <div className='flex-1 overflow-y-auto'>
        <div className='space-y-0'>
          {/* Compact info row */}
          <div className='flex items-center gap-4 px-4 py-2.5 border-b bg-muted/20'>
            <div>
              <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Status</p>
              <Badge variant={statusLabel.variant} className={cn('text-[10px] py-0 h-5 mt-0.5', statusLabel.className)}>
                {statusLabel.label}
              </Badge>
            </div>
            <div className='w-px h-6 bg-border' />
            <div>
              <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Category</p>
              <Badge variant='outline' className='text-[10px] py-0 h-5 mt-0.5'>
                {CATEGORY_LABELS[capability.category] ?? capability.category}
              </Badge>
            </div>
            <div className='w-px h-6 bg-border' />
            <div>
              <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Scope</p>
              <Badge variant='outline' className='text-[10px] py-0 h-5 mt-0.5'>
                {capability.isBranchLevel ? 'Branch' : 'Business'}
              </Badge>
            </div>
          </div>

          <div className='px-4 py-4 space-y-6'>
            {/* Usage */}
            <div className='space-y-2'>
              <h3 className='text-sm font-semibold flex items-center gap-2'>
                <Info className='h-4 w-4 text-muted-foreground' />
                Usage Limit
              </h3>
              {capability.usageLimit === null ? (
                <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                  <CheckCircle2 className='h-4 w-4 text-green-600' />
                  <span>Unlimited — no usage cap on this plan</span>
                </div>
              ) : (
                <div className='space-y-2'>
                  <div className='flex items-center justify-between text-xs text-muted-foreground'>
                    <span>Current usage</span>
                    <span className='font-medium tabular-nums'>
                      {capability.currentUsage ?? 0} / {capability.usageLimit.toLocaleString()}
                    </span>
                  </div>
                  {usagePct !== null && (
                    <>
                      <Progress value={usagePct} className='h-2' />
                      {usagePct >= 90 && (
                        <div className='flex items-center gap-1.5 text-xs text-amber-600'>
                          <AlertCircle className='h-3.5 w-3.5' />
                          <span>Approaching usage limit</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Override info */}
            {capability.hasOverride && (
              <div className='space-y-2'>
                <h3 className='text-sm font-semibold flex items-center gap-2'>
                  <Settings className='h-4 w-4 text-muted-foreground' />
                  Override Active
                </h3>
                <div className='p-3 rounded-lg bg-muted/50 space-y-1.5 text-sm'>
                  <div className='flex items-center gap-2'>
                    <span className='text-xs text-muted-foreground'>Granted:</span>
                    <Badge variant={capability.overrideGranted ? 'default' : 'destructive'} className='text-[10px] py-0 h-5'>
                      {capability.overrideGranted ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                  {capability.overrideReason && <p className='text-xs text-muted-foreground'>{capability.overrideReason}</p>}
                  {capability.overrideExpiresAt && (
                    <p className='text-xs text-muted-foreground'>Expires: {new Date(capability.overrideExpiresAt).toLocaleDateString()}</p>
                  )}
                </div>
              </div>
            )}

            {/* Capability key */}
            <div className='space-y-1'>
              <p className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>Capability Key</p>
              <code className='text-xs font-mono bg-muted px-2 py-1 rounded'>{capability.capabilityKey}</code>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className='p-4 border-t bg-background shrink-0'>
        <p className='text-xs text-muted-foreground text-center'>
          To change limits or enable/disable capabilities, contact your administrator or{' '}
          <a href='/business/subscription' className='text-primary underline-offset-2 hover:underline'>
            upgrade your plan
          </a>
          .
        </p>
      </div>
    </div>
  )
}
