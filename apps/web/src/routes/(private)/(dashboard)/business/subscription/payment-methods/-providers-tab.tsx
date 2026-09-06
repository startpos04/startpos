/**
 * Payment Providers Tab
 *
 * Displays technical details and capabilities of all configured payment providers
 */

import { TableView } from '@platform/components/custom/data-view/table-view'
import { Badge } from '@platform/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@platform/components/ui/card'
import { CheckCircleIcon, ZapIcon } from 'lucide-react'
import { paymentProviderRegistry } from '@/lib/billing/payment-provider-registry'
import { getEnabledProviderConfigs } from '@/lib/billing/provider-config'

export function ProvidersTab() {
  const enabledProviders = getEnabledProviderConfigs()

  // Convert provider data for table display
  const providersData = enabledProviders.map(({ providerId, config: _config }) => {
    const registry = paymentProviderRegistry.getConfig(providerId)
    const adapter = paymentProviderRegistry.getAdapter(providerId)
    const capabilities = adapter?.getCapabilities()

    return {
      id: providerId,
      name: registry?.displayName || providerId,
      description: registry?.description || 'Payment provider',
      capabilities: capabilities
        ? {
            automaticConfirmation: capabilities.supportsAutomaticConfirmation,
            manualReview: capabilities.supportsManualReview,
            webhooks: capabilities.supportsWebhook,
            refunds: capabilities.supportsRefund,
            recurring: capabilities.supportsRecurring,
            customerPortal: capabilities.supportsCustomerPortal,
          }
        : null,
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
      // biome-ignore lint/suspicious/noExplicitAny: flexibility required
      accessorFn: (row: any) => row.name,
      // biome-ignore lint/suspicious/noExplicitAny: flexibility required
      cell: ({ getValue, row }: any) => (
        <div className='flex items-center gap-3'>
          <div className='w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center'>
            <ZapIcon className='h-4 w-4 text-primary' />
          </div>
          <div>
            <p className='font-medium'>{getValue()}</p>
            <p className='text-sm text-muted-foreground'>{row.original.description}</p>
          </div>
        </div>
      ),
    },
    {
      id: 'capabilities',
      header: 'Capabilities',
      // biome-ignore lint/suspicious/noExplicitAny: flexibility required
      accessorFn: (row: any) => row.capabilities,
      // biome-ignore lint/suspicious/noExplicitAny: flexibility required
      cell: ({ getValue }: any) => {
        const caps = getValue()
        if (!caps) return <span className='text-muted-foreground'>-</span>

        const enabled = []
        if (caps.automaticConfirmation) enabled.push('Auto')
        if (caps.manualReview) enabled.push('Manual')
        if (caps.webhooks) enabled.push('Webhooks')
        if (caps.refunds) enabled.push('Refunds')
        if (caps.recurring) enabled.push('Recurring')
        if (caps.customerPortal) enabled.push('Portal')

        return (
          <div className='flex flex-wrap gap-1'>
            {enabled.slice(0, 3).map(cap => (
              <Badge key={cap} variant='secondary' className='text-xs'>
                {cap}
              </Badge>
            ))}
            {enabled.length > 3 && (
              <Badge variant='outline' className='text-xs'>
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
      // biome-ignore lint/suspicious/noExplicitAny: flexibility required
      accessorFn: (row: any) => row.requiresApproval,
      // biome-ignore lint/suspicious/noExplicitAny: flexibility required
      cell: ({ getValue, row }: any) => {
        const requiresApproval = getValue()
        return requiresApproval ? (
          <div className='flex items-center gap-2'>
            <Badge variant='secondary' className='text-xs'>
              Manual Approval
            </Badge>
            {row.original.gracePeriodDays && <span className='text-xs text-muted-foreground'>~{row.original.gracePeriodDays}h</span>}
          </div>
        ) : (
          <Badge variant='default' className='bg-green-100 text-green-800 text-xs'>
            Automatic
          </Badge>
        )
      },
    },
    {
      id: 'status',
      header: 'Status',
      // biome-ignore lint/suspicious/noExplicitAny: flexibility required
      accessorFn: (row: any) => row.isEnabled,
      // biome-ignore lint/suspicious/noExplicitAny: flexibility required
      cell: ({ getValue }: any) =>
        getValue() ? (
          <Badge variant='default' className='bg-green-100 text-green-800'>
            <CheckCircleIcon className='h-3 w-3 mr-1' />
            Available
          </Badge>
        ) : (
          <Badge variant='secondary'>Disabled</Badge>
        ),
    },
  ]

  return (
    <div className='h-full overflow-y-auto'>
      <div className='space-y-4 p-1'>
        {/* Header */}
        <div>
          <h2 className='text-lg font-semibold'>Available Payment Providers</h2>
          <p className='text-sm text-muted-foreground'>Technical details and capabilities of all configured payment providers</p>
        </div>

        {/* Providers Table */}
        <TableView data={providersData} columns={columns} emptyMessage='No payment providers configured' className='min-h-[400px]' />

        {/* Legend */}
        <Card>
          <CardHeader>
            <CardTitle className='text-sm'>Capability Definitions</CardTitle>
          </CardHeader>
          <CardContent className='text-sm space-y-2'>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
              <div>
                <strong>Auto:</strong> Instant payment confirmation
              </div>
              <div>
                <strong>Manual:</strong> Requires admin review
              </div>
              <div>
                <strong>Webhooks:</strong> Real-time event notifications
              </div>
              <div>
                <strong>Refunds:</strong> Supports refund processing
              </div>
              <div>
                <strong>Recurring:</strong> Subscription billing support
              </div>
              <div>
                <strong>Portal:</strong> Customer self-service portal
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
