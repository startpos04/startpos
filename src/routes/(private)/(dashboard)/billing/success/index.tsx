/**
 * billing/success/index.tsx
 *
 * /billing/success — Post-checkout success screen with V1-ready add-on upsell.
 *
 * Reached after Stripe redirects back following a successful plan checkout.
 * Search params:
 *   plan    — plan name that was just activated (e.g. "Premium")
 *   billing — billing method chosen (monthly | annual | credits)
 *
 * Flow:
 *   1. Show plan activation confirmation with improved celebration UI.
 *   2. Show V1-ready add-on upsell cards (Branches + Employees) with enhanced design.
 *   3. Each add-on integrates with real Stripe checkout via purchaseAddonSubscription.
 *   4. Improved messaging and visual hierarchy for better user experience.
 *
 * V1 Features:
 *   - Branch add-ons: Available for all plans with proper limit enforcement
 *   - Employee add-ons: Available for Basic plan (1-seat limit), unlimited for others
 *   - Real Stripe integration with proper error handling
 *   - Enhanced visual design with better spacing and typography
 */

import { createFileRoute, Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { ArrowRightIcon, BuildingIcon, CheckCircle2Icon, CrownIcon, GitBranchIcon, MinusIcon, PlusIcon, SparklesIcon, UsersIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { getAuthUser } from '@/lib/better-auth/auth-server'
import { purchaseAddonSubscription } from '@/lib/queries/purchase-addon-subscription'
import { authStore, refreshUser } from '@/store/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/billing/success/')({
  validateSearch: z.object({
    plan: z.string().optional(),
    billing: z.string().optional(),
  }),
  component: BillingSuccessPage,
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(cents: number): string {
  if (cents === 0) return 'Free'
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 0 })}/mo`
}

function formatAddonTotal(unitPrice: number, qty: number): string {
  return `₱${((unitPrice * qty) / 100).toLocaleString('en-PH', { minimumFractionDigits: 0 })}/mo`
}

// ---------------------------------------------------------------------------
// QuantityPicker
// ---------------------------------------------------------------------------

interface QuantityPickerProps {
  value: number
  min?: number
  max?: number
  onChange: (v: number) => void
}

function QuantityPicker({ value, min = 1, max = 99, onChange }: QuantityPickerProps) {
  return (
    <div className='flex items-center gap-1 bg-muted/80 rounded-lg p-1 border'>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='h-8 w-8 hover:bg-background'
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <MinusIcon className='h-3.5 w-3.5' />
      </Button>
      <div className='flex items-center justify-center min-w-[2.5rem] h-8 bg-background rounded border text-sm font-bold tabular-nums'>{value}</div>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='h-8 w-8 hover:bg-background'
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <PlusIcon className='h-3.5 w-3.5' />
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BillingSuccessPage
// ---------------------------------------------------------------------------

function BillingSuccessPage() {
  const navigate = useNavigate()
  const search = useSearch({ from: '/(private)/(dashboard)/billing/success/' })
  const planName = search.plan ?? 'your plan'
  const billingMethod = search.billing ?? 'monthly'

  const user = useStore(authStore, state => state.user)
  const configs = user?.systemConfigs

  // Refresh authStore on mount so the billing dashboard reflects the new status.
  // We use a short delay to allow the Stripe webhook to complete before reading.
  // If still GRACE_PERIOD after redirect, the billing page will show correctly.
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const freshUser = await getAuthUser()
        if (freshUser) refreshUser(freshUser)
      } catch {
        // Non-critical — billing page will refresh on its own load
      }
    }, 2000)
    return () => clearTimeout(timer)
  }, [])

  // Read add-on prices from SystemConfig (admin-configurable)
  const branchPrice = configs?.ADDON_BRANCH_PRICE ?? 19900
  const employeePrice = configs?.ADDON_EMPLOYEE_PRICE ?? 4900

  // Quantity pickers state
  const [extraBranches, setExtraBranches] = useState(1)
  const [extraEmployees, setExtraEmployees] = useState(1)

  // Loading states for better UX
  const [branchLoading, setBranchLoading] = useState(false)
  const [employeeLoading, setEmployeeLoading] = useState(false)

  // Basic plan users see the employee add-on (they only get 1 seat)
  const isBasicPlan = planName.toLowerCase() === 'basic'

  const handleAddAddon = async (addonKey: string, qty?: number) => {
    const isEmployeeAddon = addonKey === 'employee'
    if (isEmployeeAddon) setEmployeeLoading(true)
    else setBranchLoading(true)

    try {
      const result = await purchaseAddonSubscription({
        data: {
          addonId: addonKey as 'branch' | 'employee' | 'tx_500' | 'tx_1000' | 'tx_5000',
          quantity: qty ?? 1,
        },
      })

      if (!result.success) {
        toast.error(result.error ?? 'Failed to initiate checkout')
        return
      }

      // Redirect to Stripe checkout
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl
      }
    } catch (error) {
      toast.error('Failed to process add-on purchase')
      console.error('Add-on purchase error:', error)
    } finally {
      if (isEmployeeAddon) setEmployeeLoading(false)
      else setBranchLoading(false)
    }
  }

  const getBillingMethodDisplay = () => {
    if (billingMethod === 'annual') return 'Annual billing — save up to 20%'
    if (billingMethod === 'credits') return 'Pay per transaction'
    return 'Monthly billing'
  }

  const getPlanIcon = () => {
    const planLower = planName.toLowerCase()
    if (planLower === 'enterprise' || planLower === 'perpetual') return CrownIcon
    if (planLower === 'premium') return SparklesIcon
    return BuildingIcon
  }

  const PlanIcon = getPlanIcon()

  return (
    <div className='flex flex-col gap-10 px-4 py-12 max-w-3xl mx-auto'>
      {/* Enhanced Confirmation header */}
      <div className='flex flex-col items-center gap-4 text-center'>
        <div className='relative'>
          <div className='flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-900/30 dark:to-emerald-800/30 shadow-lg'>
            <CheckCircle2Icon className='h-10 w-10 text-emerald-600 dark:text-emerald-400' />
          </div>
          <div className='absolute -top-1 -right-1 p-1.5 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/30'>
            <PlanIcon className='h-4 w-4 text-blue-600 dark:text-blue-400' />
          </div>
        </div>
        <div className='space-y-2'>
          <h1 className='text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-600 to-emerald-700 dark:from-emerald-400 dark:to-emerald-300 bg-clip-text text-transparent'>
            Welcome to {planName}!
          </h1>
          <p className='text-lg text-muted-foreground max-w-md'>Your account has been upgraded and is ready to go.</p>
          <div className='flex items-center justify-center gap-2'>
            <Badge variant='outline' className='text-emerald-700 border-emerald-300 bg-emerald-50/80 dark:bg-emerald-900/20 font-medium'>
              ✨ Active
            </Badge>
            <Badge variant='secondary' className='text-muted-foreground font-normal'>
              {getBillingMethodDisplay()}
            </Badge>
          </div>
        </div>
      </div>

      <Separator className='my-2' />

      {/* Enhanced Add-on upsell section */}
      <div className='space-y-6'>
        <div className='text-center space-y-2'>
          <h2 className='text-2xl font-bold tracking-tight'>Scale your business</h2>
          <p className='text-muted-foreground max-w-lg mx-auto'>
            Add more capacity to your {planName} plan. Expand your operations with additional branches and team members.
          </p>
        </div>

        <div className='grid gap-6 md:grid-cols-2'>
          {/* Extra Branches */}
          <Card className='relative overflow-hidden border-2 hover:border-emerald-200 dark:hover:border-emerald-800 transition-all duration-200 hover:shadow-lg group'>
            <div className='absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-emerald-600' />
            <CardHeader className='pb-3'>
              <div className='flex items-start gap-4'>
                <div className='p-3 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-900/30 dark:to-emerald-800/30 group-hover:scale-105 transition-transform duration-200'>
                  <GitBranchIcon className='h-6 w-6 text-emerald-600 dark:text-emerald-400' />
                </div>
                <div className='flex-1 space-y-1'>
                  <CardTitle className='text-lg font-bold'>Additional Branches</CardTitle>
                  <CardDescription className='text-sm leading-relaxed'>Expand to new locations. Perfect for multi-site operations.</CardDescription>
                  <div className='flex items-center gap-2 pt-1'>
                    <Badge variant='outline' className='text-xs font-medium'>
                      {formatPrice(branchPrice)}
                    </Badge>
                    <span className='text-xs text-muted-foreground'>per branch</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='flex items-center justify-between p-3 rounded-lg bg-muted/50'>
                <span className='text-sm font-medium'>Branches to add:</span>
                <QuantityPicker value={extraBranches} onChange={setExtraBranches} />
              </div>
              <div className='text-right'>
                <p className='text-lg font-bold text-emerald-600 dark:text-emerald-400'>{formatAddonTotal(branchPrice, extraBranches)}</p>
                <p className='text-xs text-muted-foreground'>monthly total</p>
              </div>
            </CardContent>
            <CardFooter>
              <Button className='w-full' size='lg' disabled={branchLoading} onClick={() => handleAddAddon('branch', extraBranches)}>
                {branchLoading ? (
                  'Processing...'
                ) : (
                  <>
                    Add {extraBranches} {extraBranches === 1 ? 'Branch' : 'Branches'}
                    <ArrowRightIcon className='h-4 w-4 ml-2' />
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>

          {/* Extra Employees — Basic tier only */}
          {isBasicPlan && (
            <Card className='relative overflow-hidden border-2 hover:border-blue-200 dark:hover:border-blue-800 transition-all duration-200 hover:shadow-lg group'>
              <div className='absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-blue-600' />
              <CardHeader className='pb-3'>
                <div className='flex items-start gap-4'>
                  <div className='p-3 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/30 group-hover:scale-105 transition-transform duration-200'>
                    <UsersIcon className='h-6 w-6 text-blue-600 dark:text-blue-400' />
                  </div>
                  <div className='flex-1 space-y-1'>
                    <div className='flex items-center gap-2'>
                      <CardTitle className='text-lg font-bold'>Additional Employees</CardTitle>
                      <Badge variant='secondary' className='text-xs'>
                        Basic Only
                      </Badge>
                    </div>
                    <CardDescription className='text-sm leading-relaxed'>Add more team members beyond your 1-seat Basic limit.</CardDescription>
                    <div className='flex items-center gap-2 pt-1'>
                      <Badge variant='outline' className='text-xs font-medium'>
                        {formatPrice(employeePrice)}
                      </Badge>
                      <span className='text-xs text-muted-foreground'>per employee</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='flex items-center justify-between p-3 rounded-lg bg-muted/50'>
                  <span className='text-sm font-medium'>Employees to add:</span>
                  <QuantityPicker value={extraEmployees} onChange={setExtraEmployees} />
                </div>
                <div className='text-right'>
                  <p className='text-lg font-bold text-blue-600 dark:text-blue-400'>{formatAddonTotal(employeePrice, extraEmployees)}</p>
                  <p className='text-xs text-muted-foreground'>monthly total</p>
                </div>
              </CardContent>
              <CardFooter>
                <Button className='w-full' size='lg' disabled={employeeLoading} onClick={() => handleAddAddon('employee', extraEmployees)}>
                  {employeeLoading ? (
                    'Processing...'
                  ) : (
                    <>
                      Add {extraEmployees} {extraEmployees === 1 ? 'Employee' : 'Employees'}
                      <ArrowRightIcon className='h-4 w-4 ml-2' />
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          )}
        </div>

        {/* Additional context for non-Basic plans */}
        {!isBasicPlan && (
          <Card className='border-dashed border-2 border-muted-foreground/20 bg-muted/20'>
            <CardContent className='flex items-center gap-3 p-4'>
              <div className='p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30'>
                <UsersIcon className='h-5 w-5 text-blue-600 dark:text-blue-400' />
              </div>
              <div className='flex-1'>
                <p className='text-sm font-medium'>Employee accounts</p>
                <p className='text-xs text-muted-foreground'>Your {planName} plan includes unlimited employee accounts at no extra cost.</p>
              </div>
              <Badge variant='outline' className='text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20'>
                Unlimited ∞
              </Badge>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Enhanced Footer actions */}
      <div className='flex flex-col items-center gap-4 pt-4'>
        <Button size='lg' className='w-full max-w-sm font-semibold' asChild>
          <Link to='/billing'>
            <BuildingIcon className='h-4 w-4 mr-2' />
            Go to Dashboard
          </Link>
        </Button>
        <button
          type='button'
          onClick={() => navigate({ to: '/billing' })}
          className='text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4'
        >
          I'll add these later
        </button>
      </div>
    </div>
  )
}
