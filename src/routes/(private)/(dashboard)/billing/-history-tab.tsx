/**
 * Branch Billing History Tab
 * 
 * Displays transaction history for credit purchases and usage
 */

import { useQuery } from '@tanstack/react-query'
import { getColumns } from '@/components/custom/data-view'
import { TableView } from '@/components/custom/data-view/table-view'
import { invoiceCols } from '@/lib/columns/invoice-columns'
import { getBranchCreditBalance } from '@/lib/server-fn/get-branch-credit-balance'

export function HistoryTab() {
  const { data: creditData, isLoading } = useQuery({
    queryKey: ['branch-credit-balance'],
    queryFn: () => getBranchCreditBalance(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  const entries = creditData?.entries || []

  // Define columns for the credit history table
  const columns = getColumns<typeof entries[number]>(h => [
    invoiceCols.dateWithTime(h),
    invoiceCols.creditEventType(h),
    invoiceCols.creditDescription(h),
    invoiceCols.creditAmount(h),
    invoiceCols.creditBalanceAfter(h),
  ])

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
