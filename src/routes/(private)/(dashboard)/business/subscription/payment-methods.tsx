/**
 * payment-methods.tsx
 * 
 * Payment method selection and management page using the provider registry.
 * Shows available payment providers, their capabilities, and setup status.
 * 
 * Following component standards:
 * - Uses custom Tabs component
 * - Uses Table View for provider listings
 * - Uses Mount Manager for dialogs
 * - Uses Sonner for toast notifications
 */

import { TableView } from '@/components/custom/data-view/table-view'
import Tab from '@/components/custom/tab'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { paymentProviderRegistry } from '@/lib/billing/payment-provider-registry'
import { getEnabledProviderConfigs } from '@/lib/billing/provider-config'
import MountManager from '@/lib/mount-manager'
import { authStore } from '@/store/auth-store'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  Banknote,
  CheckCircleIcon,
  CreditCardIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ZapIcon
} from 'lucide-react'
import { toast } from 'sonner'

export const Route = createFileRoute('/(private)/(dashboard)/business/subscription/payment-methods')({
  component: PaymentMethodsPage,
})

function PaymentMethodsPage() {
  const navigate = useNavigate()

  // Create wrapper components for tabs
  const OverviewTabComponent = () => <OverviewTab />
  const ProvidersTabComponent = () => <ProvidersTab />

  const tabs = [
    { 
      label: 'Overview', 
      Component: OverviewTabComponent
    },
    { 
      label: 'Available Providers', 
      Component: ProvidersTabComponent
    },
  ]

  return (
    <div className="flex flex-col h-full px-4">
      {/* Page header */}
      <div className="flex-shrink-0 pb-4">
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/business/subscription' })} className="-ml-2">
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            Back to Subscription
          </Button>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Payment Methods</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Manage how you pay for your subscription and services
        </p>
      </div>

      {/* Tabs with content */}
      <div className="flex-1 min-h-0">
        <Tab tabs={tabs} defaultValue="Overview" className="h-full" />
      </div>

      {/* Mount Manager for dialogs */}
      <MountManager />
    </div>
  )
}

function OverviewTab() {
  const user = useStore(authStore, s=>s.user)
  
  // Get current business payment preferences
  const currentProvider = user?.business?.preferredPaymentProvider || null
  const enabledProviders = getEnabledProviderConfigs()

  const getProviderIcon = (providerId: string) => {
    switch (providerId) {
      case 'stripe':
        return <CreditCardIcon className="h-5 w-5" />
      case 'manual':
        return <Banknote className="h-5 w-5" />
      default:
        return <ZapIcon className="h-5 w-5" />
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl space-y-6 p-1">
        {/* Current Payment Method */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5" />
              Current Payment Method
            </CardTitle>
            <CardDescription>
              The payment method used for your subscription and billing
            </CardDescription>
          </CardHeader>
          <CardContent>
            {currentProvider ? (
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  {getProviderIcon(currentProvider)}
                  <div>
                    <p className="font-medium capitalize">
                      {currentProvider === 'manual' ? 'Manual Payment' : currentProvider}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {getProviderDescription(currentProvider, enabledProviders.find(p => p.providerId === currentProvider)?.config)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="bg-green-100 text-green-800">
                    <CheckCircleIcon className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                  <Button variant="outline" size="sm">
                    Change
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/30">
                <AlertCircleIcon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">No payment method configured</p>
                  <p className="text-xs text-muted-foreground">Choose a provider below to get started.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Available Payment Methods */}
        <Card>
          <CardHeader>
            <CardTitle>Available Payment Methods</CardTitle>
            <CardDescription>
              Payment providers available for your business
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
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
                    <div className="flex items-center gap-3">
                      {getProviderIcon(providerId)}
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{registry?.displayName || providerId}</p>
                          {registry?.badges?.map((badge) => (
                            <Badge key={badge} variant="secondary" className="text-xs">
                              {badge}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {registry?.description || getProviderDescription(providerId, config)}
                        </p>
                        {registry?.requiresApproval && (
                          <p className="text-xs text-amber-600 mt-1">
                            ⏱️ Requires manual approval within {registry.gracePeriodDays || 24}h
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isActive ? (
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          <CheckCircleIcon className="h-3 w-3 mr-1" />
                          Current
                        </Badge>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleSelectProvider(providerId)}
                        >
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
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <ShieldCheckIcon className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900 dark:text-blue-100">
                  Secure Payment Processing
                </h4>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  All payment methods use industry-standard encryption and security practices. 
                  Your payment information is never stored on our servers.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )

  function handleSelectProvider(providerId: string) {
    const registry = paymentProviderRegistry.getConfig(providerId)
    
    if (registry?.config?.setupRoute) {
      // Navigate to provider-specific setup route
      navigate({ to: registry.config.setupRoute })
    } else {
      // Generic provider selection (would implement server function)
      toast.info(`Setting up ${registry?.displayName || providerId}...`)
    }
  }
}

function ProvidersTab() {
  const enabledProviders = getEnabledProviderConfigs()

  // Convert provider data for table display
  const providersData = enabledProviders.map(({ providerId, config }) => {
    const registry = paymentProviderRegistry.getConfig(providerId)
    const adapter = paymentProviderRegistry.getAdapter(providerId)
    const capabilities = adapter?.getCapabilities()

    return {
      id: providerId,
      name: registry?.displayName || providerId,
      description: registry?.description || 'Payment provider',
      capabilities: capabilities ? {
        automaticConfirmation: capabilities.supportsAutomaticConfirmation,
        manualReview: capabilities.supportsManualReview,
        webhooks: capabilities.supportsWebhook,
        refunds: capabilities.supportsRefund,
        recurring: capabilities.supportsRecurring,
        customerPortal: capabilities.supportsCustomerPortal,
      } : null,
      badges: registry?.badges || [],
      isEnabled: registry?.isEnabled || false,
      requiresApproval: registry?.requiresApproval || false,
      gracePeriodDays: registry?.gracePeriodDays,
      countries: registry?.availableInCountries || [],
    }
  })

  const columns = [
    {
      id: 'name',
      header: 'Provider',
      accessorFn: (row: any) => row.name,
      cell: ({ getValue, row }: any) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <ZapIcon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-medium">{getValue()}</p>
            <p className="text-sm text-muted-foreground">{row.original.description}</p>
          </div>
        </div>
      ),
    },
    {
      id: 'capabilities',
      header: 'Capabilities',
      accessorFn: (row: any) => row.capabilities,
      cell: ({ getValue }: any) => {
        const caps = getValue()
        if (!caps) return <span className="text-muted-foreground">-</span>

        const enabled = []
        if (caps.automaticConfirmation) enabled.push('Auto')
        if (caps.manualReview) enabled.push('Manual')
        if (caps.webhooks) enabled.push('Webhooks')
        if (caps.refunds) enabled.push('Refunds')
        if (caps.recurring) enabled.push('Recurring')
        if (caps.customerPortal) enabled.push('Portal')

        return (
          <div className="flex flex-wrap gap-1">
            {enabled.slice(0, 3).map((cap) => (
              <Badge key={cap} variant="secondary" className="text-xs">
                {cap}
              </Badge>
            ))}
            {enabled.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{enabled.length - 3} more
              </Badge>
            )}
          </div>
        )
      },
    },
    {
      id: 'approval',
      header: 'Processing',
      accessorFn: (row: any) => row.requiresApproval,
      cell: ({ getValue, row }: any) => {
        const requiresApproval = getValue()
        return requiresApproval ? (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              Manual Approval
            </Badge>
            {row.original.gracePeriodDays && (
              <span className="text-xs text-muted-foreground">
                ~{row.original.gracePeriodDays}h
              </span>
            )}
          </div>
        ) : (
          <Badge variant="default" className="bg-green-100 text-green-800 text-xs">
            Automatic
          </Badge>
        )
      },
    },
    {
      id: 'status',
      header: 'Status',
      accessorFn: (row: any) => row.isEnabled,
      cell: ({ getValue }: any) => (
        getValue() ? (
          <Badge variant="default" className="bg-green-100 text-green-800">
            <CheckCircleIcon className="h-3 w-3 mr-1" />
            Available
          </Badge>
        ) : (
          <Badge variant="secondary">
            Disabled
          </Badge>
        )
      ),
    },
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-4 p-1">
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold">Available Payment Providers</h2>
          <p className="text-sm text-muted-foreground">
            Technical details and capabilities of all configured payment providers
          </p>
        </div>

        {/* Providers Table */}
        <TableView
          data={providersData}
          columns={columns}
          emptyMessage="No payment providers configured"
          className="min-h-[400px]"
        />

        {/* Legend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Capability Definitions</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><strong>Auto:</strong> Instant payment confirmation</div>
              <div><strong>Manual:</strong> Requires admin review</div>
              <div><strong>Webhooks:</strong> Real-time event notifications</div>
              <div><strong>Refunds:</strong> Supports refund processing</div>
              <div><strong>Recurring:</strong> Subscription billing support</div>
              <div><strong>Portal:</strong> Customer self-service portal</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}