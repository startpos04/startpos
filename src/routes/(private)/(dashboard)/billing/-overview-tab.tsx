/**
 * Branch Billing Overview Tab
 * 
 * Displays current credit balance, transaction quota, and available credit packages
 */

import { useQuery } from '@tanstack/react-query'
import { AlertCircle, GitBranchIcon, ShoppingCartIcon, TrendingUp, Zap } from 'lucide-react'
import { BuyBranchCreditsDialog } from './-components/buy-branch-credits-dialog'
import { Badge } from '@startpos-core/components/ui/badge'
import { Button } from '@startpos-core/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@startpos-core/components/ui/card'
import { Skeleton } from '@startpos-core/components/ui/skeleton'
import { getBranchCreditPackages } from '@/lib/billing/credit-packages'
import MountManager from '@/lib/mount-manager'
import { fetchEntitlementDetails } from '@/lib/server-fn/fetch-entitlement-details'
import { getBranchCreditBalance } from '@/lib/server-fn/get-branch-credit-balance'
import { authStore } from '@startpos-core/lib/better-auth/auth-store'
import { toast } from 'sonner'

export function OverviewTab() {
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
  const txRemaining = entitlementData?.txRemaining ?? null
  const txUsedThisPeriod = entitlementData?.txUsedThisPeriod ?? 0
  const creditBalance = creditData?.balance ?? 0
  const isLoading = creditLoading || entitlementLoading
  
  // For display - show subscription TX quota
  const isUnlimitedTx = txRemaining === null
  const displayQuotaUsed = txUsedThisPeriod
  const displayQuotaRemaining = txRemaining
  const displayQuotaTotal = (displayQuotaRemaining !== null && displayQuotaUsed !== null) 
    ? displayQuotaRemaining + displayQuotaUsed 
    : null

  if (isLoading) {
    return <OverviewSkeleton />
  }

  // Determine if branch is approaching or at its limit
  const isAtLimit = !isUnlimitedTx && displayQuotaRemaining !== null && displayQuotaRemaining <= 0
  const isNearLimit = !isUnlimitedTx && displayQuotaRemaining !== null && displayQuotaRemaining > 0 && displayQuotaRemaining <= (displayQuotaUsed + displayQuotaRemaining) * 0.2

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
              {isUnlimitedTx 
                ? '∞' 
                : `${(displayQuotaRemaining ?? 0).toLocaleString()} / ${(displayQuotaTotal ?? 0).toLocaleString()}`
              }
            </div>
            <p className="text-xs text-muted-foreground">
              {isUnlimitedTx 
                ? 'Unlimited transactions in current period'
                : `${displayQuotaUsed.toLocaleString()} used this period`
              }
            </p>
            {isAtLimit && (
              <Badge variant="destructive" className="mt-2">
                Quota Exhausted
              </Badge>
            )}
            {isNearLimit && !isAtLimit && (
              <Badge variant="secondary" className="mt-2">
                Running Low
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
