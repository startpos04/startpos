/**
 * Branch Billing Dashboard - /billing
 * 
 * Branch-level credit management interface with two tabs:
 * 1. Overview - Current status and credit packages
 * 2. History - Transaction history table
 */

import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, CreditCard, TrendingUp, Zap, ShoppingCartIcon, GitBranchIcon } from 'lucide-react'
import { BuyBranchCreditsDialog } from '@/components/custom/billing'
import { TableView } from '@/components/custom/data-view/table-view'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import Tab from '@/components/custom/tab'
import MountManager from '@/lib/mount-manager'
import { getBranchCreditBalance } from '@/lib/server-fn/get-branch-credit-balance'
import { fetchEntitlementDetails } from '@/lib/server-fn/fetch-entitlement-details'
import { authStore } from '@/store/auth-store'
import { cn } from '@/lib/utils'
import { getBranchCreditPackages } from '@/lib/billing/credit-packages'

export const Route = createFileRoute('/(private)/(dashboard)/billing/')({
  component: BranchBillingPage,
})

function BranchBillingPage() {
  // Create wrapper components 
  const OverviewTabComponent = () => <OverviewTab />
  const HistoryTabComponent = () => <HistoryTab />

  const tabs = [
    { 
      label: 'Overview', 
      Component: OverviewTabComponent
    },
    { 
      label: 'History', 
      Component: HistoryTabComponent
    },
  ]

  return (
    <div className="flex flex-col h-full px-4">
      {/* Page header - fixed */}
      <div className="flex-shrink-0 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Branch Billing</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Manage your branch's transaction credits and quota settings.
        </p>
      </div>

      {/* Tabs with scrollable content */}
      <div className="flex-1 min-h-0">
        <Tab tabs={tabs} defaultValue="Overview" className="h-full" />
      </div>

      {/* Mount Manager handles dialogs */}
      <MountManager />
    </div>
  )
}

function OverviewTab() {
  const user = authStore.state.user
  
  // Query branch credit balance
  const { data: creditData, isLoading: creditLoading, error: creditError } = useQuery({
    queryKey: ['branch-credit-balance'],
    queryFn: () => getBranchCreditBalance(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  // Query entitlement details to get transaction usage
  const { data: entitlementData, isLoading: entitlementLoading } = useQuery({
    queryKey: ['entitlement-details'],
    queryFn: () => fetchEntitlementDetails(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
  
  if (!user?.branch) {
    toast.error('Unable to load branch information. Please contact support if this issue persists.')
    return (
      <div className="flex items-center justify-center h-full p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Unable to load branch information</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (creditError) {
    toast.error('Failed to load branch credit information. Please try again later.')
    return (
      <div className="flex items-center justify-center h-full p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Failed to load branch credit information</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const branchName = user.branch.name
  const txQuotaLimit = user.branch.txQuotaLimit
  const currentUsage = entitlementData?.txUsedThisPeriod || 0
  const creditBalance = creditData?.balance || 0
  const isLoading = creditLoading || entitlementLoading

  if (isLoading) {
    return <OverviewSkeleton />
  }

  // Determine if branch is approaching or at its limit
  const isAtLimit = txQuotaLimit && currentUsage >= txQuotaLimit
  const isNearLimit = txQuotaLimit && currentUsage >= txQuotaLimit * 0.8

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl space-y-6 p-1">
        {/* Branch Status Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transaction Quota</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {currentUsage.toLocaleString()} / {txQuotaLimit?.toLocaleString() || '∞'}
            </div>
            <p className="text-xs text-muted-foreground">
              {txQuotaLimit 
                ? `${Math.max(0, txQuotaLimit - currentUsage).toLocaleString()} remaining this period`
                : 'Unlimited transactions'
              }
            </p>
            {isAtLimit && (
              <Badge variant="destructive" className="mt-2">
                Limit Reached
              </Badge>
            )}
            {isNearLimit && !isAtLimit && (
              <Badge variant="secondary" className="mt-2">
                Approaching Limit
              </Badge>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Credit Balance</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{creditBalance.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Credits available for overflow transactions
            </p>
            {creditBalance === 0 && isAtLimit && (
              <Badge variant="destructive" className="mt-2">
                No Credits Available
              </Badge>
            )}
            {creditBalance > 0 && (
              <Badge variant="default" className="mt-2">
                {creditBalance.toLocaleString()} Credits
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Branch</CardTitle>
            <GitBranchIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">{branchName}</div>
            <p className="text-xs text-muted-foreground">
              Current branch location
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Alert when limit is reached and no credits */}
      {isAtLimit && creditBalance === 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Transaction processing blocked</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your branch has reached its transaction limit and has no credits remaining. 
                  Purchase credits below to continue processing transactions.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Credit Package Purchase Section */}
      <Card>
        <CardHeader className="pb-3">
          <div>
            <CardTitle className="text-lg">Credit Packages</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Purchase credits for overflow transactions when you exceed your quota limit.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <BranchCreditPackageList />
        </CardContent>
      </Card>
      </div>
    </div>
  )
}

function BranchCreditPackageList() {
  const packages = getBranchCreditPackages()

  return (
    <div className="space-y-2">
      {packages.map((pkg) => (
        <div key={pkg.id} className="flex flex-col sm:flex-row sm:items-center justify-between py-3 px-4 rounded-lg bg-muted/40 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-muted-foreground shrink-0">
              <Zap className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium flex items-center gap-2">
                {pkg.credits} Credits
                {pkg.popular && (
                  <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded-full">
                    Popular
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground truncate">{pkg.description}</p>
            </div>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
            <div className="text-right">
              <p className="text-sm font-medium">{pkg.price}</p>
              <p className="text-xs text-muted-foreground">₱{pkg.pricePerCredit.toFixed(2)}/credit</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-3 text-xs w-fit"
              onClick={() => MountManager.show(BuyBranchCreditsDialog, {
                packageData: {
                  credits: pkg.credits,
                  price: pkg.price,
                  description: pkg.description
                },
                key: 'buy-branch-credits-dialog'
              })}
            >
              <ShoppingCartIcon className="h-3 w-3 mr-1.5" />
              Buy
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
function HistoryTab() {
  const { data: creditData, isLoading } = useQuery({
    queryKey: ['branch-credit-balance'],
    queryFn: () => getBranchCreditBalance(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  const entries = creditData?.entries || []

  // Define columns for the credit history table
  const columns = [
    {
      id: 'date',
      header: 'Date',
      accessorFn: (row: any) => row.createdAt,
      cell: ({ getValue }: any) => {
        const date = new Date(getValue())
        return (
          <div>
            <div className="font-medium text-sm">
              {date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })}
            </div>
            <div className="text-xs text-muted-foreground">
              {date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>
        )
      },
    },
    {
      id: 'type',
      header: 'Type',
      accessorFn: (row: any) => row.eventType,
      cell: ({ getValue }: any) => {
        const eventType = getValue()
        return (
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              eventType === 'PURCHASE' ? 'bg-emerald-500' : 'bg-red-500'
            )} />
            <Badge variant={eventType === 'PURCHASE' ? 'default' : 'secondary'} className="text-xs">
              {eventType === 'PURCHASE' ? 'Purchase' : 'Usage'}
            </Badge>
          </div>
        )
      },
    },
    {
      id: 'description',
      header: 'Description',
      accessorFn: (row: any) => row.eventType,
      cell: ({ getValue, row }: any) => {
        const eventType = getValue()
        return (
          <div>
            <p className="text-sm">
              {eventType === 'PURCHASE' 
                ? 'Credit package purchased'
                : 'Credit used for overflow transaction'
              }
            </p>
            {row.original.reference && (
              <p className="text-xs text-muted-foreground">
                Ref: {row.original.reference}
              </p>
            )}
          </div>
        )
      },
    },
    {
      id: 'amount',
      header: 'Amount',
      accessorFn: (row: any) => row.amount,
      cell: ({ getValue }: any) => {
        const amount = getValue()
        return (
          <div className="text-right">
            <span className={cn(
              "font-medium",
              amount > 0 ? 'text-emerald-600' : 'text-red-600'
            )}>
              {amount > 0 ? '+' : ''}{amount}
            </span>
          </div>
        )
      },
    },
    {
      id: 'balanceAfter',
      header: 'Balance After',
      accessorFn: (row: any) => row.balanceAfter,
      cell: ({ getValue }: any) => (
        <div className="text-right font-medium">
          {getValue()}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      {/* Header section */}
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Credit Transaction History</h2>
        <p className="text-sm text-muted-foreground">
          All credit purchases and usage for this branch.
        </p>
      </div>

      {/* Full-width table without card wrapper */}
      <TableView
        data={entries}
        columns={columns}
        isFetching={isLoading}
        emptyMessage="No credit transactions found. Credit purchases and usage will appear here."
        className="min-h-[500px]"
      />
    </div>
  )
}

function OverviewSkeleton() {
  return (
    <div className="max-w-5xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20 mb-2" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div>
              <Skeleton className="h-6 w-32 mb-2" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-9 w-24" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/40 gap-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-4 w-4" />
                  <div>
                    <Skeleton className="h-4 w-20 mb-1" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <Skeleton className="h-4 w-12 mb-1" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-8 w-12" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
