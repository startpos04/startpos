/**
 * Payment Methods Overview Tab
 *
 * Displays current payment method and available payment providers
 */

import { Badge } from '@platform/components/ui/badge'
import { Button } from '@platform/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@platform/components/ui/card'
import { authStore } from '@platform/lib/better-auth/auth-store'
import { useNavigate } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { AlertCircleIcon, Banknote, CheckCircleIcon, CreditCardIcon, SettingsIcon, ShieldCheckIcon, ZapIcon } from 'lucide-react'
import { toast } from 'sonner'
import { paymentProviderRegistry } from '@/lib/billing/payment-provider-registry'
import { getEnabledProviderConfigs } from '@/lib/billing/provider-config'

export function OverviewTab() {
  const navigate = useNavigate()
  const user = useStore(authStore, s => s.user)

  // Get current business payment preferences
  const currentProvider = user?.business?.preferredPaymentProvider || null
  const enabledProviders = getEnabledProviderConfigs()

  const getProviderIcon = (providerId: string) => {
    switch (providerId) {
      case 'stripe':
        return <CreditCardIcon className='h-5 w-5' />
      case 'manual':
        return <Banknote className='h-5 w-5' />
      default:
        return <ZapIcon className='h-5 w-5' />
    }
  }

  const getProviderDescription = (providerId: string, config: any) => {
    switch (providerId) {
      case 'stripe':
        return 'Credit/debit cards with automatic payment processing'
      case 'manual':
        return `${config.paymentMethod} payments with manual admin approval`
      default:
        return 'Payment provider'
    }
  }

  const handleSelectProvider = (providerId: string) => {
    const registry = paymentProviderRegistry.getConfig(providerId)

    if (registry?.config?.setupRoute) {
      // Navigate to provider-specific setup route
      navigate({ to: registry.config.setupRoute })
    } else {
      // Generic provider selection (would implement server function)
      toast.info(`Setting up ${registry?.displayName || providerId}...`)
    }
  }

  return (
    <div className='h-full overflow-y-auto'>
      <div className='max-w-4xl space-y-6 p-1'>
        {/* Current Payment Method */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <SettingsIcon className='h-5 w-5' />
              Current Payment Method
            </CardTitle>
            <CardDescription>The payment method used for your subscription and billing</CardDescription>
          </CardHeader>
          <CardContent>
            {currentProvider ? (
              <div className='flex items-center justify-between p-4 border rounded-lg'>
                <div className='flex items-center gap-3'>
                  {getProviderIcon(currentProvider)}
                  <div>
                    <p className='font-medium capitalize'>{currentProvider === 'manual' ? 'Manual Payment' : currentProvider}</p>
                    <p className='text-sm text-muted-foreground'>
                      {getProviderDescription(currentProvider, enabledProviders.find(p => p.providerId === currentProvider)?.config)}
                    </p>
                  </div>
                </div>
                <div className='flex items-center gap-2'>
                  <Badge variant='default' className='bg-green-100 text-green-800'>
                    <CheckCircleIcon className='h-3 w-3 mr-1' />
                    Active
                  </Badge>
                  <Button variant='outline' size='sm'>
                    Change
                  </Button>
                </div>
              </div>
            ) : (
              <div className='flex items-center gap-3 p-4 border rounded-lg bg-muted/30'>
                <AlertCircleIcon className='h-5 w-5 text-muted-foreground' />
                <div>
                  <p className='text-sm font-medium'>No payment method configured</p>
                  <p className='text-xs text-muted-foreground'>Choose a provider below to get started.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Available Payment Methods */}
        <Card>
          <CardHeader>
            <CardTitle>Available Payment Methods</CardTitle>
            <CardDescription>Payment providers available for your business</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='space-y-3'>
              {enabledProviders.map(({ providerId, config }) => {
                const registry = paymentProviderRegistry.getConfig(providerId)
                const isActive = currentProvider === providerId

                return (
                  <div
                    key={providerId}
                    className={`flex items-center justify-between p-4 border rounded-lg transition-colors ${
                      isActive ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className='flex items-center gap-3'>
                      {getProviderIcon(providerId)}
                      <div>
                        <div className='flex items-center gap-2'>
                          <p className='font-medium'>{registry?.displayName || providerId}</p>
                          {registry?.badges?.map(badge => (
                            <Badge key={badge} variant='secondary' className='text-xs'>
                              {badge}
                            </Badge>
                          ))}
                        </div>
                        <p className='text-sm text-muted-foreground'>{registry?.description || getProviderDescription(providerId, config)}</p>
                        {registry?.requiresApproval && (
                          <p className='text-xs text-amber-600 mt-1'>â±ï¸ Requires manual approval within {registry.gracePeriodDays || 24}h</p>
                        )}
                      </div>
                    </div>
                    <div className='flex items-center gap-2'>
                      {isActive ? (
                        <Badge variant='default' className='bg-green-100 text-green-800'>
                          <CheckCircleIcon className='h-3 w-3 mr-1' />
                          Current
                        </Badge>
                      ) : (
                        <Button variant='outline' size='sm' onClick={() => handleSelectProvider(providerId)}>
                          Select
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Security Notice */}
        <Card className='border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20'>
          <CardContent className='pt-6'>
            <div className='flex items-start gap-3'>
              <ShieldCheckIcon className='h-5 w-5 text-blue-600 mt-0.5' />
              <div>
                <h4 className='font-medium text-blue-900 dark:text-blue-100'>Secure Payment Processing</h4>
                <p className='text-sm text-blue-700 dark:text-blue-300 mt-1'>
                  All payment methods use industry-standard encryption and security practices. Your payment information is never stored on our servers.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
