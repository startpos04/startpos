/**
 * Business Capability Details Sidebar
 *
 * Side drawer that shows detailed information about a business capability
 * and provides actions to enable, pause, dismiss, or restore it.
 */

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ChevronDown, ChevronUp, Info, Pause, Play, RefreshCw, TrendingUp, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@startpos-core/components/ui/badge'
import { Button } from '@startpos-core/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@startpos-core/components/ui/tooltip'
import { getCapabilityBenefits, getCapabilitySteps } from '@/lib/capabilities/capability-guide'
import type { CapabilityStateRow } from '@/lib/server-fn/fetch-capability-states'
import { acceptCapability, dismissCapability, enableCapability, pauseCapability, restoreCapability } from '@/lib/server-fn/capability-actions'
import { cn } from '@startpos-core/lib/utils'
import { refreshAuthUser } from '@startpos-core/lib/better-auth/auth-store'
import { closeBusinessCapabilitySidebar } from './business-capability-sidebar'

interface BusinessCapabilityDetailsSidebarProps {
  capability: CapabilityStateRow
  onClose?: () => void
}

export function BusinessCapabilityDetailsSidebar({ capability, onClose }: BusinessCapabilityDetailsSidebarProps) {
  const queryClient = useQueryClient()
  const handleClose = onClose ?? closeBusinessCapabilitySidebar
  const [loading, setLoading] = useState(false)
  const [showWhy, setShowWhy] = useState(false)

  const run = async (fn: () => Promise<{ ok: boolean; reason?: string }>) => {
    setLoading(true)
    try {
      const result = await fn()
      if (!result.ok) {
        toast.error(result.reason ?? 'Action failed')
      } else {
        toast.success('Capability updated successfully')
        await queryClient.invalidateQueries({ queryKey: ['capability-states'] })
        // Refresh authStore so useCapability() hooks update immediately
        await refreshAuthUser()
      }
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleEnable = () => run(() => acceptCapability({ data: { capabilityId: capability.capabilityId } }))
  const handlePause = () => run(() => pauseCapability({ data: { capabilityId: capability.capabilityId } }))
  const handleRestore = () => run(() => restoreCapability({ data: { capabilityId: capability.capabilityId } }))
  const handleDismiss = () => run(() => dismissCapability({ data: { capabilityId: capability.capabilityId } }))
  const handleEnableHidden = () => run(() => enableCapability({ data: { capabilityId: capability.capabilityId } }))

  const stateConfig: Record<
    string,
    { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }
  > = {
    ENABLED: { label: 'Enabled', variant: 'default', className: 'bg-green-600 hover:bg-green-600 text-white' },
    CONFIGURED: { label: 'Active', variant: 'default', className: 'bg-green-700 hover:bg-green-700 text-white' },
    RECOMMENDED: { label: 'Recommended', variant: 'secondary', className: 'bg-primary/10 text-primary border-primary/20' },
    PAUSED: { label: 'Paused', variant: 'outline' },
    HIDDEN: { label: 'Hidden', variant: 'outline', className: 'text-muted-foreground' },
    DEPRECATED: { label: 'Deprecated', variant: 'destructive' },
  }

  const stateInfo = stateConfig[capability.state] ?? { label: capability.state, variant: 'outline' as const }
  const categoryLabels: Record<string, string> = {
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

  return (
    <div className='flex flex-col h-full'>
      {/* Header */}
      <div className='flex items-start justify-between p-4 border-b shrink-0'>
        <div className='flex gap-3 flex-1 min-w-0'>
          <div className='h-10 w-10 rounded-xl border shadow-sm shrink-0 flex items-center justify-center bg-primary/10'>
            <TrendingUp className='h-5 w-5 text-primary' />
          </div>
          <div className='flex-1 min-w-0'>
            <div className='flex items-center gap-2 flex-wrap'>
              <h2 className='text-base font-semibold leading-tight'>{capability.label}</h2>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant='ghost' size='icon' className='h-5 w-5 shrink-0'>
                      <Info className='h-3.5 w-3.5 text-muted-foreground' />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side='bottom' className='max-w-xs'>
                    <p className='text-xs'>
                      <strong>About Capabilities:</strong> Capabilities are features and functionality that you can enable for your business.
                      Enabling a capability may require additional setup steps. Changes take effect immediately across all branches.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
        <Button variant='ghost' size='icon' onClick={handleClose} className='h-7 w-7 shrink-0'>
          <X className='size-4' />
        </Button>
      </div>

      {/* Content */}
      <div className='flex-1 overflow-y-auto'>
        <div className='space-y-6'>
          {/* Compact info row — status, category, learn more */}
          <div className='flex items-center gap-4 px-4 py-2.5 border-b bg-muted/20'>
            <div>
              <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Status</p>
              <Badge variant={stateInfo.variant} className={cn('text-[10px] py-0 h-5 mt-0.5', stateInfo.className)}>
                {stateInfo.label}
              </Badge>
            </div>
            <div className='w-px h-6 bg-border' />
            <div>
              <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Category</p>
              <Badge variant='outline' className='text-[10px] py-0 h-5 mt-0.5'>
                {categoryLabels[capability.category] || capability.category}
              </Badge>
            </div>
            <div className='ml-auto'>
              <Button variant='link' size='sm' className='h-auto p-0 text-xs text-primary'>
                Learn More →
              </Button>
            </div>
          </div>

          <div className='px-4 space-y-6'>
            {/* Overview Section */}
            <div className='space-y-3'>
              <h3 className='text-sm font-semibold'>Overview</h3>
              <p className='text-sm text-muted-foreground leading-relaxed'>
                {capability.businessValue || 'This capability enhances your business operations by providing additional functionality and features.'}
              </p>
            </div>

            {/* What You Get Section - Capability-specific content */}
            {getCapabilityBenefits(capability.capabilityId).length > 0 && (
              <div className='space-y-3'>
                <h3 className='text-sm font-semibold'>What You Get</h3>
                <ul className='space-y-2 text-sm text-muted-foreground'>
                  {getCapabilityBenefits(capability.capabilityId).map((benefit, idx) => (
                    <li key={idx} className='flex items-start gap-2'>
                      <CheckCircle2 className='h-4 w-4 text-green-600 shrink-0 mt-0.5' />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* How to Use Section - Capability-specific content */}
            {getCapabilitySteps(capability.capabilityId).length > 0 && (
              <div className='space-y-3'>
                <h3 className='text-sm font-semibold'>How to Use</h3>
                <div className='space-y-3 text-sm text-muted-foreground'>
                  {getCapabilitySteps(capability.capabilityId).map((step, idx) => (
                    <div key={idx} className='flex gap-3'>
                      <div className='flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0'>
                        {idx + 1}
                      </div>
                      <div>
                        <p className='font-medium text-foreground'>{step.title}</p>
                        <p className='text-xs mt-0.5'>{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Recommendation Reason */}
          {capability.state === 'RECOMMENDED' && capability.recommendationReason && (
            <div className='space-y-3'>
              <div className='flex items-center justify-between'>
                <h3 className='text-sm font-semibold'>Why is this recommended?</h3>
                <Button variant='ghost' size='sm' onClick={() => setShowWhy(v => !v)} className='h-auto p-0 text-xs text-primary'>
                  {showWhy ? (
                    <>
                      Hide <ChevronUp className='h-3 w-3 ml-1' />
                    </>
                  ) : (
                    <>
                      Show <ChevronDown className='h-3 w-3 ml-1' />
                    </>
                  )}
                </Button>
              </div>
              {showWhy && (
                <div className='p-3 rounded-lg bg-muted/50'>
                  <p className='text-sm'>{capability.recommendationReason}</p>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Footer with Actions */}
      {(capability.state === 'RECOMMENDED' ||
        capability.state === 'ENABLED' ||
        capability.state === 'CONFIGURED' ||
        capability.state === 'PAUSED' ||
        capability.state === 'HIDDEN') && (
        <div className='p-4 border-t bg-background shrink-0'>
          <div className='space-y-2'>
            {capability.state === 'RECOMMENDED' && (
              <>
                <Button onClick={handleEnable} disabled={loading} className='w-full' size='sm'>
                  <Play className='h-4 w-4 mr-2' />
                  Enable Capability
                </Button>
                <Button onClick={handleDismiss} disabled={loading} variant='outline' className='w-full' size='sm'>
                  <X className='h-4 w-4 mr-2' />
                  Dismiss Recommendation
                </Button>
              </>
            )}
            {(capability.state === 'ENABLED' || capability.state === 'CONFIGURED') && capability.canBePaused && (
              <Button onClick={handlePause} disabled={loading} variant='outline' className='w-full' size='sm'>
                <Pause className='h-4 w-4 mr-2' />
                Pause Capability
              </Button>
            )}
            {capability.state === 'PAUSED' && (
              <Button onClick={handleRestore} disabled={loading} className='w-full' size='sm'>
                <RefreshCw className='h-4 w-4 mr-2' />
                Restore Capability
              </Button>
            )}
            {capability.state === 'HIDDEN' && (
              <Button onClick={handleEnableHidden} disabled={loading} className='w-full' size='sm'>
                <Play className='h-4 w-4 mr-2' />
                Enable Capability
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
