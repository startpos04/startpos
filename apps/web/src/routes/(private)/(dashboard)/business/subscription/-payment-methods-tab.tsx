/**
 * Subscription Payment Methods Tab
 *
 * Displays payment method management
 */

import { Badge } from '@platform/components/ui/badge'
import { Button } from '@platform/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@platform/components/ui/card'
import { authStore } from '@platform/lib/better-auth/auth-store'
import { Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { CreditCardIcon, MailIcon } from 'lucide-react'

export function PaymentMethodsTab() {
  const user = useStore(authStore, state => state.user)
  const preferredProvider = user?.business?.preferredPaymentProvider

  return (
    <div className='h-full overflow-y-auto px-4 py-1'>
      <div className='max-w-5xl space-y-6'>
        <div className='flex items-center justify-between'>
          <div>
            <h2 className='text-lg font-semibold'>Payment Methods</h2>
            <p className='text-sm text-muted-foreground'>Manage how you pay for subscriptions and services</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Current Payment Method</CardTitle>
            <CardDescription>The payment method used for your business subscription</CardDescription>
          </CardHeader>
          <CardContent>
            {preferredProvider ? (
              <div className='space-y-4'>
                <div className='flex items-center justify-between p-4 border rounded-lg'>
                  <div className='flex items-center gap-3'>
                    <div className='w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center'>
                      <CreditCardIcon className='h-5 w-5 text-primary' />
                    </div>
                    <div>
                      <p className='font-medium capitalize'>{preferredProvider === 'manual' ? 'Manual Payment' : preferredProvider}</p>
                      <p className='text-sm text-muted-foreground'>
                        {preferredProvider === 'stripe' ? 'Credit/debit cards with automatic processing' : 'Manual payments with admin approval'}
                      </p>
                    </div>
                  </div>
                  <Badge variant='default' className='bg-green-100 text-green-800'>
                    Active
                  </Badge>
                </div>
                <div className='flex justify-end'>
                  <Button variant='outline' asChild>
                    <Link to='/business/subscription/payment-methods'>Manage Payment Methods</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className='text-center py-8'>
                <CreditCardIcon className='h-12 w-12 mx-auto text-muted-foreground mb-4' />
                <h3 className='text-lg font-medium mb-2'>No Payment Method Set</h3>
                <p className='text-sm text-muted-foreground mb-4'>Choose a payment method to manage your subscription</p>
                <Button asChild>
                  <Link to='/business/subscription/payment-methods'>Set Up Payment Method</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Additional payment information */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Payment Options</CardTitle>
            <CardDescription>Available payment methods for your subscription</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='flex items-start gap-3 p-3 rounded-lg border'>
              <CreditCardIcon className='h-5 w-5 text-muted-foreground mt-0.5' />
              <div className='flex-1'>
                <p className='font-medium text-sm'>Credit/Debit Card (Stripe)</p>
                <p className='text-xs text-muted-foreground mt-1'>Automatic billing with instant activation. Securely processed via Stripe.</p>
              </div>
            </div>
            <div className='flex items-start gap-3 p-3 rounded-lg border'>
              <MailIcon className='h-5 w-5 text-muted-foreground mt-0.5' />
              <div className='flex-1'>
                <p className='font-medium text-sm'>Manual Payment</p>
                <p className='text-xs text-muted-foreground mt-1'>Submit payment proof for admin review. Typically activated within 24 hours.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
