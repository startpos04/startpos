/**
 * billing/pricing/index.tsx
 *
 * /billing/pricing — Composable Pricing Calculator
 *
 * Allows a business to select features à la carte, see a live price breakdown
 * driven entirely by server-side PricingEngine.calculate(), and generate a quote.
 *
 * Architecture compliance:
 *   - Zero client-side price arithmetic — all calculations are server-side only.
 *   - Feature selection → server mutation → PricingResult displayed.
 *   - No PricingEngine imports in this file (G10 — engine is infrastructure-free).
 *   - MANAGE_BILLING capability required.
 */

import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  InfoIcon,
  Loader2Icon,
  SparklesIcon,
  TagIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { createPricingQuote } from '@/lib/queries/create-pricing-quote'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/(private)/(dashboard)/billing/pricing/')({
  component: PricingCalculatorPage,
})

// ---------------------------------------------------------------------------
// Feature catalogue display structure
// This mirrors the pricingCategory + sortOrder in the database.
// Used only for grouping UI — prices come from the server.
// ---------------------------------------------------------------------------

type FeatureOption = {
  key: string
  label: string
  description: string
  category: string
  isIncludedInBase: boolean
}

const FEATURE_CATEGORIES = ['CORE', 'OPERATIONAL', 'MANAGEMENT', 'ADVANCED', 'INTEGRATION'] as const
type FeatureCategory = (typeof FEATURE_CATEGORIES)[number]

const CATEGORY_LABELS: Record<FeatureCategory, string> = {
  CORE: 'Core (Always Included)',
  OPERATIONAL: 'Operational',
  MANAGEMENT: 'Management & Reporting',
  ADVANCED: 'Advanced',
  INTEGRATION: 'Integration & API',
}

// Selectable features (mirrors isSelectableByCustomer = true in the DB)
const SELECTABLE_FEATURES: FeatureOption[] = [
  // Included in base
  {
    key: 'COMPLETE_CHECKOUT',
    label: 'Complete Checkout',
    description: 'Process POS transactions and collect payment',
    category: 'CORE',
    isIncludedInBase: true,
  },
  { key: 'MANAGE_INVENTORY', label: 'Manage Inventory', description: 'Adjust, transfer, and reconcile stock', category: 'CORE', isIncludedInBase: true },
  { key: 'RECORD_PAYMENT', label: 'Record Payment', description: 'Record payments against orders or invoices', category: 'CORE', isIncludedInBase: true },
  // Operational
  { key: 'CREATE_ORDER', label: 'Create Order', description: 'Create kitchen or service orders', category: 'OPERATIONAL', isIncludedInBase: false },
  { key: 'EDIT_ACTIVE_ORDER', label: 'Edit Active Order', description: 'Modify orders in progress', category: 'OPERATIONAL', isIncludedInBase: false },
  { key: 'ISSUE_REFUND', label: 'Issue Refund', description: 'Process refunds against completed sales', category: 'OPERATIONAL', isIncludedInBase: false },
  { key: 'PRINT_RECEIPT', label: 'Print Receipt', description: 'Generate and print transaction receipts', category: 'OPERATIONAL', isIncludedInBase: false },
  { key: 'START_VENDOR_SESSION', label: 'Vendor Sessions', description: 'Open cash reconciliation sessions', category: 'OPERATIONAL', isIncludedInBase: false },
  { key: 'CREATE_PURCHASE', label: 'Create Purchase', description: 'Record stock purchases from suppliers', category: 'OPERATIONAL', isIncludedInBase: false },
  { key: 'CREATE_TASK', label: 'Task Management', description: 'Create and manage operational tasks', category: 'OPERATIONAL', isIncludedInBase: false },
  // Management
  {
    key: 'MANAGE_PRODUCTS',
    label: 'Manage Products',
    description: 'Create, edit, and archive products and variants',
    category: 'MANAGEMENT',
    isIncludedInBase: false,
  },
  {
    key: 'MANAGE_EMPLOYEES',
    label: 'Manage Employees',
    description: 'Invite, edit, and deactivate employee accounts',
    category: 'MANAGEMENT',
    isIncludedInBase: false,
  },
  {
    key: 'MANAGE_CUSTOMERS',
    label: 'Manage Customers',
    description: 'View and manage the customer directory',
    category: 'MANAGEMENT',
    isIncludedInBase: false,
  },
  { key: 'MANAGE_SUPPLIERS', label: 'Manage Suppliers', description: 'Create and manage supplier records', category: 'MANAGEMENT', isIncludedInBase: false },
  {
    key: 'VIEW_SALES_REPORTS',
    label: 'Sales Reports',
    description: 'Revenue, transaction, and trend reports',
    category: 'MANAGEMENT',
    isIncludedInBase: false,
  },
  {
    key: 'VIEW_INVENTORY_REPORTS',
    label: 'Inventory Reports',
    description: 'Stock movement and valuation reports',
    category: 'MANAGEMENT',
    isIncludedInBase: false,
  },
  { key: 'EXPORT_DATA', label: 'Export Data', description: 'Download transaction and inventory data as CSV', category: 'MANAGEMENT', isIncludedInBase: false },
  // Advanced
  {
    key: 'VIEW_ANALYTICS',
    label: 'Analytics Dashboard',
    description: 'Advanced analytics and business intelligence',
    category: 'ADVANCED',
    isIncludedInBase: false,
  },
  { key: 'MANAGE_BRANCHES', label: 'Multi-Branch', description: 'Create and configure additional branches', category: 'ADVANCED', isIncludedInBase: false },
  // Integration
  { key: 'ACCESS_API', label: 'API Access', description: 'Developer API and key management', category: 'INTEGRATION', isIncludedInBase: false },
]

// ---------------------------------------------------------------------------
// PricingCalculatorPage
// ---------------------------------------------------------------------------

function PricingCalculatorPage() {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set(SELECTABLE_FEATURES.filter(f => f.isIncludedInBase).map(f => f.key)))
  const [requestAnnual, setRequestAnnual] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(FEATURE_CATEGORIES))
  const [quoteResult, setQuoteResult] = useState<{
    quoteId: string
    grandTotal: number
    annualGrandTotal: number | null
    annualSavings: number | null
    validUntil: string
  } | null>(null)

  const calculateMutation = useMutation({
    mutationFn: () =>
      createPricingQuote({
        data: {
          selectedFeatureKeys: Array.from(selectedKeys),
          branchCount: 1,
          requestAnnual,
          promoDiscountPct: 0,
        },
      }),
    onSuccess: result => {
      if (result.success) {
        setQuoteResult({
          quoteId: result.quoteId,
          grandTotal: result.grandTotal,
          annualGrandTotal: result.annualGrandTotal,
          annualSavings: result.annualSavings,
          validUntil: result.validUntil,
        })
      }
    },
  })

  function toggleFeature(key: string, isBase: boolean) {
    if (isBase) return // Base features cannot be deselected
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
    setQuoteResult(null) // Clear previous result on selection change
  }

  function toggleCategory(cat: string) {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const selectableCount = selectedKeys.size - SELECTABLE_FEATURES.filter(f => f.isIncludedInBase).length

  return (
    <div className='flex flex-col gap-6 px-4 max-w-5xl'>
      {/* Header */}
      <div className='flex items-center gap-3'>
        <Button variant='ghost' size='icon' asChild>
          <Link to='/billing'>
            <ArrowLeftIcon className='h-4 w-4' />
          </Link>
        </Button>
        <div>
          <h1 className='text-3xl font-bold tracking-tight text-foreground'>Pricing Calculator</h1>
          <p className='text-muted-foreground text-sm mt-0.5'>Build your custom plan by selecting the features your business needs.</p>
        </div>
      </div>

      <div className='grid gap-6 lg:grid-cols-[1fr_320px]'>
        {/* Feature selection */}
        <div className='space-y-4'>
          {FEATURE_CATEGORIES.map(cat => {
            const features = SELECTABLE_FEATURES.filter(f => f.category === cat)
            const isExpanded = expandedCategories.has(cat)
            const selectedInCat = features.filter(f => selectedKeys.has(f.key)).length

            return (
              <Card key={cat}>
                <button type='button' className='w-full text-left' onClick={() => toggleCategory(cat)}>
                  <CardHeader className='pb-2 cursor-pointer select-none'>
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-2'>
                        <CardTitle className='text-base'>{CATEGORY_LABELS[cat]}</CardTitle>
                        {selectedInCat > 0 && (
                          <Badge variant='secondary' className='text-xs'>
                            {selectedInCat}/{features.length}
                          </Badge>
                        )}
                      </div>
                      {isExpanded ? <ChevronUpIcon className='h-4 w-4 text-muted-foreground' /> : <ChevronDownIcon className='h-4 w-4 text-muted-foreground' />}
                    </div>
                  </CardHeader>
                </button>

                {isExpanded && (
                  <CardContent className='pt-0 pb-3'>
                    <div className='space-y-1'>
                      {features.map(feature => {
                        const isSelected = selectedKeys.has(feature.key)
                        const isBase = feature.isIncludedInBase

                        return (
                          <button
                            key={feature.key}
                            type='button'
                            disabled={isBase}
                            onClick={() => toggleFeature(feature.key, isBase)}
                            className={cn(
                              'w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors',
                              isBase ? 'cursor-default opacity-70' : 'cursor-pointer hover:bg-muted/50',
                              isSelected && !isBase && 'bg-primary/5 ring-1 ring-primary/20',
                            )}
                          >
                            <div
                              className={cn(
                                'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-input bg-background',
                              )}
                            >
                              {isSelected && <CheckIcon className='h-2.5 w-2.5' />}
                            </div>
                            <div className='flex-1 min-w-0'>
                              <div className='flex items-center gap-1.5'>
                                <span className='text-sm font-medium text-foreground'>{feature.label}</span>
                                {isBase && (
                                  <Badge variant='outline' className='text-[10px] px-1.5 py-0 h-4'>
                                    Included
                                  </Badge>
                                )}
                              </div>
                              <p className='text-xs text-muted-foreground truncate'>{feature.description}</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>

        {/* Pricing summary sidebar */}
        <div className='space-y-4'>
          <Card className='sticky top-4'>
            <CardHeader className='pb-3'>
              <div className='flex items-center gap-2'>
                <SparklesIcon className='h-5 w-5 text-muted-foreground' />
                <CardTitle className='text-base'>Your Selection</CardTitle>
              </div>
              <CardDescription className='text-xs'>
                {selectableCount} add-on{selectableCount !== 1 ? 's' : ''} selected
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              {/* Annual toggle */}
              <div className='flex items-center justify-between'>
                <Label htmlFor='annual-toggle' className='text-sm font-medium cursor-pointer'>
                  <div className='flex items-center gap-1.5'>
                    <CalendarIcon className='h-3.5 w-3.5 text-muted-foreground' />
                    Annual billing
                  </div>
                  <p className='text-xs text-muted-foreground font-normal mt-0.5'>Save 10% vs monthly</p>
                </Label>
                <Switch
                  id='annual-toggle'
                  checked={requestAnnual}
                  onCheckedChange={v => {
                    setRequestAnnual(v)
                    setQuoteResult(null)
                  }}
                />
              </div>

              <Separator />

              {/* Quote result */}
              {quoteResult ? (
                <div className='space-y-3'>
                  <div className='space-y-1'>
                    <p className='text-xs text-muted-foreground'>Monthly total</p>
                    <p className='text-2xl font-bold tabular-nums text-foreground'>
                      {formatCents(quoteResult.grandTotal)}
                      <span className='text-sm font-normal text-muted-foreground'>/mo</span>
                    </p>
                  </div>

                  {quoteResult.annualGrandTotal !== null && (
                    <div className='rounded-md bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 space-y-0.5'>
                      <p className='text-xs font-medium text-emerald-800 dark:text-emerald-300'>Annual: {formatCents(quoteResult.annualGrandTotal)}/yr</p>
                      {quoteResult.annualSavings !== null && quoteResult.annualSavings > 0 && (
                        <p className='text-xs text-emerald-700 dark:text-emerald-400'>Save {formatCents(quoteResult.annualSavings)} vs monthly</p>
                      )}
                    </div>
                  )}

                  <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                    <InfoIcon className='h-3.5 w-3.5 shrink-0' />
                    Quote valid until {new Date(quoteResult.validUntil).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>

                  <div className='flex flex-col gap-2'>
                    <Button size='sm' asChild>
                      <Link to='/billing/quotes/$quoteId' params={{ quoteId: quoteResult.quoteId }}>
                        Review Quote
                        <ArrowRightIcon className='h-3.5 w-3.5 ml-1.5' />
                      </Link>
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => {
                        setQuoteResult(null)
                      }}
                    >
                      Recalculate
                    </Button>
                  </div>
                </div>
              ) : (
                <div className='space-y-3'>
                  <p className='text-xs text-muted-foreground'>Select features and calculate to see your monthly total.</p>

                  {calculateMutation.isError && (
                    <p className='text-xs text-destructive'>
                      {calculateMutation.error instanceof Error ? calculateMutation.error.message : 'Calculation failed. Please try again.'}
                    </p>
                  )}

                  {calculateMutation.data && !calculateMutation.data.success && <p className='text-xs text-destructive'>{calculateMutation.data.error}</p>}

                  <Button
                    size='sm'
                    className='w-full'
                    onClick={() => calculateMutation.mutate()}
                    disabled={calculateMutation.isPending || selectedKeys.size === 0}
                  >
                    {calculateMutation.isPending ? (
                      <>
                        <Loader2Icon className='h-3.5 w-3.5 mr-1.5 animate-spin' />
                        Calculating…
                      </>
                    ) : (
                      <>
                        <TagIcon className='h-3.5 w-3.5 mr-1.5' />
                        Calculate Price
                      </>
                    )}
                  </Button>
                </div>
              )}

              <Separator />

              <div className='space-y-1'>
                <Link to='/billing/quotes' className='flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors'>
                  View saved quotes <ArrowRightIcon className='h-3 w-3' />
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(cents / 100)
}
