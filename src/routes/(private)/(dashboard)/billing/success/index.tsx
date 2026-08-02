/**
 * billing/success/index.tsx
 *
 * /billing/success — Post-checkout success screen with add-on upsell.
 *
 * Reached after Stripe redirects back following a successful plan checkout.
 * Search params:
 *   plan    — plan name that was just activated (e.g. "Premium")
 *   billing — billing method chosen (monthly | annual | credits)
 *
 * Flow:
 *   1. Show plan activation confirmation.
 *   2. Show add-on upsell cards (Analytics, API Access, Extra Branches,
 *      Extra Employees for Basic only) with quantity pickers.
 *   3. Each add-on "Add" button goes to its own Stripe checkout.
 *   4. "Skip for now" navigates to /billing.
 *
 * Architecture:
 *   - Add-on prices read from authStore.systemConfigs (sourced from SystemConfig DB).
 *   - No price arithmetic in the component — prices are stored as PHP cents.
 *   - Quantity pickers are local state — no server call until "Add" is clicked.
 */

import { createFileRoute, Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { ArrowRightIcon, BarChart3Icon, CheckCircle2Icon, CodeIcon, GitBranchIcon, MinusIcon, PlusIcon, UsersIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { authStore } from '@/store/auth-store'

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
    <div className='flex items-center gap-2 bg-muted rounded-lg p-1'>
      <Button type='button' variant='ghost' size='icon' className='h-7 w-7' disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        <MinusIcon className='h-3 w-3' />
      </Button>
      <span className='text-sm font-bold w-5 text-center tabular-nums'>{value}</span>
      <Button type='button' variant='ghost' size='icon' className='h-7 w-7' disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        <PlusIcon className='h-3 w-3' />
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

  // Read add-on prices from SystemConfig (admin-configurable)
  const analyticsPrice = configs?.ADDON_ANALYTICS_PRICE ?? 29900
  const apiPrice = configs?.ADDON_API_PRICE ?? 49900
  const branchPrice = configs?.ADDON_BRANCH_PRICE ?? 19900
  const employeePrice = configs?.ADDON_EMPLOYEE_PRICE ?? 4900

  // Quantity pickers state
  const [extraBranches, setExtraBranches] = useState(1)
  const [extraEmployees, setExtraEmployees] = useState(1)

  // Which add-ons are toggled on
  const [addedAnalytics, setAddedAnalytics] = useState(false)
  const [addedApi, setAddedApi] = useState(false)
  const [addedBranches, setAddedBranches] = useState(false)
  const [addedEmployees, setAddedEmployees] = useState(false)

  // Basic plan users see the employee add-on (they only get 1 seat)
  const isBasicPlan = planName.toLowerCase() === 'basic'

  const handleAddAddon = (addonKey: string, qty?: number) => {
    // TODO: wire to purchaseCreditPackage / createSubscription with add-on price IDs
    // For now, show a toast and mark as added — full Stripe integration in Phase B
    toast.info(`Add-on "${addonKey}" checkout coming soon.${qty ? ` Qty: ${qty}` : ''}`)
    switch (addonKey) {
      case 'analytics':
        setAddedAnalytics(true)
        break
      case 'api':
        setAddedApi(true)
        break
      case 'branches':
        setAddedBranches(true)
        break
      case 'employees':
        setAddedEmployees(true)
        break
    }
  }

  return (
    <div className='flex flex-col gap-8 px-4 py-8 max-w-2xl mx-auto'>
      {/* Confirmation header */}
      <div className='flex flex-col items-center gap-3 text-center'>
        <div className='flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30'>
          <CheckCircle2Icon className='h-8 w-8 text-emerald-600 dark:text-emerald-400' />
        </div>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>You're all set!</h1>
          <p className='text-muted-foreground text-sm mt-1'>
            <span className='font-medium text-foreground'>{planName}</span> plan activated
            {billingMethod === 'annual' ? ' — billed annually' : billingMethod === 'credits' ? ' — pay per transaction' : ' — billed monthly'}.
          </p>
        </div>
        <Badge variant='outline' className='text-emerald-700 border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20'>
          Active
        </Badge>
      </div>

      <Separator />

      {/* Add-on upsell section */}
      <div className='space-y-4'>
        <div>
          <h2 className='text-base font-semibold'>Supercharge your plan</h2>
          <p className='text-sm text-muted-foreground mt-0.5'>Add premium features on top of your {planName} plan. Cancel any time.</p>
        </div>

        {/* Analytics Dashboard */}
        <Card className={cn('transition-colors', addedAnalytics && 'border-emerald-400/60 bg-emerald-50/30 dark:bg-emerald-900/10')}>
          <CardHeader className='pb-2'>
            <div className='flex items-start justify-between gap-4'>
              <div className='flex items-center gap-3'>
                <div className='p-2 rounded-lg bg-muted'>
                  <BarChart3Icon className='h-4 w-4 text-muted-foreground' />
                </div>
                <div>
                  <CardTitle className='text-sm'>Analytics Dashboard</CardTitle>
                  <CardDescription className='text-xs'>Advanced sales trends, staff performance, revenue vs cost, and heatmaps.</CardDescription>
                </div>
              </div>
              <p className='text-sm font-bold shrink-0'>{formatPrice(analyticsPrice)}</p>
            </div>
          </CardHeader>
          <CardFooter className='pt-0'>
            {addedAnalytics ? (
              <Badge variant='outline' className='text-emerald-700 border-emerald-300 bg-emerald-50 text-xs'>
                <CheckCircle2Icon className='h-3 w-3 mr-1' /> Added
              </Badge>
            ) : (
              <Button size='sm' variant='outline' onClick={() => handleAddAddon('analytics')}>
                Add Analytics <ArrowRightIcon className='h-3.5 w-3.5 ml-1.5' />
              </Button>
            )}
          </CardFooter>
        </Card>

        {/* API Access */}
        <Card className={cn('transition-colors', addedApi && 'border-emerald-400/60 bg-emerald-50/30 dark:bg-emerald-900/10')}>
          <CardHeader className='pb-2'>
            <div className='flex items-start justify-between gap-4'>
              <div className='flex items-center gap-3'>
                <div className='p-2 rounded-lg bg-muted'>
                  <CodeIcon className='h-4 w-4 text-muted-foreground' />
                </div>
                <div>
                  <CardTitle className='text-sm'>API Access</CardTitle>
                  <CardDescription className='text-xs'>Generate API keys and integrate StartPOS with your own tools and automations.</CardDescription>
                </div>
              </div>
              <p className='text-sm font-bold shrink-0'>{formatPrice(apiPrice)}</p>
            </div>
          </CardHeader>
          <CardFooter className='pt-0'>
            {addedApi ? (
              <Badge variant='outline' className='text-emerald-700 border-emerald-300 bg-emerald-50 text-xs'>
                <CheckCircle2Icon className='h-3 w-3 mr-1' /> Added
              </Badge>
            ) : (
              <Button size='sm' variant='outline' onClick={() => handleAddAddon('api')}>
                Add API Access <ArrowRightIcon className='h-3.5 w-3.5 ml-1.5' />
              </Button>
            )}
          </CardFooter>
        </Card>

        {/* Extra Branches */}
        <Card className={cn('transition-colors', addedBranches && 'border-emerald-400/60 bg-emerald-50/30 dark:bg-emerald-900/10')}>
          <CardHeader className='pb-2'>
            <div className='flex items-start justify-between gap-4'>
              <div className='flex items-center gap-3'>
                <div className='p-2 rounded-lg bg-muted'>
                  <GitBranchIcon className='h-4 w-4 text-muted-foreground' />
                </div>
                <div>
                  <CardTitle className='text-sm'>Extra Branches</CardTitle>
                  <CardDescription className='text-xs'>Add more locations beyond your plan's limit. {formatPrice(branchPrice)} per branch/mo.</CardDescription>
                </div>
              </div>
              <p className='text-sm font-bold shrink-0 text-right'>{formatAddonTotal(branchPrice, extraBranches)}</p>
            </div>
          </CardHeader>
          <CardContent className='pb-2'>
            <div className='flex items-center gap-3'>
              <span className='text-xs text-muted-foreground'>Branches to add:</span>
              <QuantityPicker value={extraBranches} onChange={setExtraBranches} />
            </div>
          </CardContent>
          <CardFooter className='pt-0'>
            {addedBranches ? (
              <Badge variant='outline' className='text-emerald-700 border-emerald-300 bg-emerald-50 text-xs'>
                <CheckCircle2Icon className='h-3 w-3 mr-1' /> Added
              </Badge>
            ) : (
              <Button size='sm' variant='outline' onClick={() => handleAddAddon('branches', extraBranches)}>
                Add {extraBranches} {extraBranches === 1 ? 'Branch' : 'Branches'} <ArrowRightIcon className='h-3.5 w-3.5 ml-1.5' />
              </Button>
            )}
          </CardFooter>
        </Card>

        {/* Extra Employees — Basic tier only */}
        {isBasicPlan && (
          <Card className={cn('transition-colors', addedEmployees && 'border-emerald-400/60 bg-emerald-50/30 dark:bg-emerald-900/10')}>
            <CardHeader className='pb-2'>
              <div className='flex items-start justify-between gap-4'>
                <div className='flex items-center gap-3'>
                  <div className='p-2 rounded-lg bg-muted'>
                    <UsersIcon className='h-4 w-4 text-muted-foreground' />
                  </div>
                  <div>
                    <CardTitle className='text-sm'>Extra Employees</CardTitle>
                    <CardDescription className='text-xs'>
                      Add more employee accounts beyond your 1-seat Basic limit. {formatPrice(employeePrice)} per employee/mo.
                    </CardDescription>
                  </div>
                </div>
                <p className='text-sm font-bold shrink-0 text-right'>{formatAddonTotal(employeePrice, extraEmployees)}</p>
              </div>
            </CardHeader>
            <CardContent className='pb-2'>
              <div className='flex items-center gap-3'>
                <span className='text-xs text-muted-foreground'>Employees to add:</span>
                <QuantityPicker value={extraEmployees} onChange={setExtraEmployees} />
              </div>
            </CardContent>
            <CardFooter className='pt-0'>
              {addedEmployees ? (
                <Badge variant='outline' className='text-emerald-700 border-emerald-300 bg-emerald-50 text-xs'>
                  <CheckCircle2Icon className='h-3 w-3 mr-1' /> Added
                </Badge>
              ) : (
                <Button size='sm' variant='outline' onClick={() => handleAddAddon('employees', extraEmployees)}>
                  Add {extraEmployees} {extraEmployees === 1 ? 'Employee' : 'Employees'} <ArrowRightIcon className='h-3.5 w-3.5 ml-1.5' />
                </Button>
              )}
            </CardFooter>
          </Card>
        )}
      </div>

      {/* Footer actions */}
      <div className='flex flex-col items-center gap-2'>
        <Button className='w-full max-w-xs' asChild>
          <Link to='/billing'>Go to Billing Dashboard</Link>
        </Button>
        <button type='button' onClick={() => navigate({ to: '/billing' })} className='text-xs text-muted-foreground hover:text-foreground transition-colors'>
          Skip add-ons for now
        </button>
      </div>
    </div>
  )
}
