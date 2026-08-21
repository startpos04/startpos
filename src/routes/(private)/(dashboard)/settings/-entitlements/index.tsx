/**
 * settings/entitlements — Branch-level feature configuration
 *
 * Shows which capabilities are enabled at the business level and allows
 * branch managers to configure branch-specific settings for each capability.
 *
 * Features:
 *   - List all enabled business capabilities
 *   - For each capability, show branch-specific configuration options
 *   - Show locked/unavailable features (when business capability is disabled)
 *   - Allow enable/disable of features at branch level (within business constraints)
 */

import { createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { CheckCircle, Lock, Settings, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { authStore } from '@/store/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/settings/-entitlements/')({
  component: EntitlementsPage,
})

/**
 * Branch Entitlements Page
 *
 * This page shows business capabilities and allows branch-level configuration.
 * It's a placeholder implementation that will be expanded as the entitlement
 * system is built out.
 */
export function EntitlementsPage() {
  const user = useStore(authStore, state => state.user)
  const entitlement = user?.entitlement

  if (!entitlement) {
    return (
      <div className='flex items-center justify-center h-full p-6'>
        <Card>
          <CardContent className='pt-6'>
            <p className='text-muted-foreground'>No entitlement information available</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Get enabled features from plan
  const enabledFeatures = entitlement.planFeatures || []
  const currentPlan = entitlement.planName || 'Unknown'
  const status = entitlement.status || 'UNKNOWN'

  return (
    <div className='flex flex-col gap-6 p-6'>
      {/* Header */}
      <div className='flex flex-col gap-2'>
        <h1 className='text-3xl font-bold'>Branch Entitlements</h1>
        <p className='text-muted-foreground'>Configure which features are enabled for this branch. Features must be enabled at the business level first.</p>
      </div>

      {/* Current Plan Info */}
      <Card>
        <CardHeader>
          <CardTitle className='text-lg'>Current Plan</CardTitle>
          <CardDescription>Your subscription determines which features are available</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center gap-4'>
            <div className='flex items-center gap-2'>
              <span className='text-sm font-medium'>Plan:</span>
              <Badge variant='default'>{currentPlan}</Badge>
            </div>
            <div className='flex items-center gap-2'>
              <span className='text-sm font-medium'>Status:</span>
              <Badge variant={status === 'ACTIVE' ? 'default' : 'destructive'}>{status}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Enabled Features */}
      <Card>
        <CardHeader>
          <CardTitle className='text-lg'>Available Features</CardTitle>
          <CardDescription>Features enabled by your business subscription. Contact your admin to enable more features.</CardDescription>
        </CardHeader>
        <CardContent>
          {enabledFeatures.length === 0 ? (
            <p className='text-sm text-muted-foreground'>No features enabled</p>
          ) : (
            <div className='space-y-3'>
              {enabledFeatures.map(feature => (
                <FeatureRow key={feature} featureName={feature} enabled={true} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Locked Features (Example) */}
      <Card className='border-muted'>
        <CardHeader>
          <CardTitle className='text-lg flex items-center gap-2'>
            <Lock className='h-4 w-4 text-muted-foreground' />
            Locked Features
          </CardTitle>
          <CardDescription>Upgrade your business plan to unlock these features</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='space-y-3'>
            <LockedFeatureRow featureName='Advanced Reporting' />
            <LockedFeatureRow featureName='Multi-currency Support' />
            <LockedFeatureRow featureName='API Access' />
          </div>
          <Separator className='my-4' />
          <div className='flex items-center justify-between'>
            <p className='text-sm text-muted-foreground'>Want to unlock more features?</p>
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
              <p className='text-sm font-medium'>Branch-Specific Configuration</p>
              <p className='text-sm text-muted-foreground'>
                As the entitlement system is expanded, you'll be able to configure branch-specific settings for each enabled feature here. This might include
                things like payment methods, order fulfillment options, inventory tracking preferences, and more.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Feature Row Component - Shows an enabled feature
 */
function FeatureRow({ featureName, enabled }: { featureName: string; enabled: boolean }) {
  return (
    <div className='flex items-center justify-between p-3 rounded-lg border'>
      <div className='flex items-center gap-3'>
        {enabled ? <CheckCircle className='h-5 w-5 text-green-600' /> : <XCircle className='h-5 w-5 text-muted-foreground' />}
        <div>
          <p className='text-sm font-medium'>{formatFeatureName(featureName)}</p>
          <p className='text-xs text-muted-foreground'>Enabled at business level</p>
        </div>
      </div>
      <Switch checked={enabled} disabled className='pointer-events-none' />
    </div>
  )
}

/**
 * Locked Feature Row Component - Shows a feature that's not available
 */
function LockedFeatureRow({ featureName }: { featureName: string }) {
  return (
    <div className='flex items-center justify-between p-3 rounded-lg border border-dashed bg-muted/30'>
      <div className='flex items-center gap-3'>
        <Lock className='h-5 w-5 text-muted-foreground' />
        <div>
          <p className='text-sm font-medium text-muted-foreground'>{featureName}</p>
          <p className='text-xs text-muted-foreground'>Not included in your plan</p>
        </div>
      </div>
      <Badge variant='outline' className='text-muted-foreground'>
        Locked
      </Badge>
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
