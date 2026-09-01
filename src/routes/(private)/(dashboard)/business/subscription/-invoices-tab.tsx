/**
 * Subscription Invoices Tab
 * 
 * Displays billing invoices table
 */

import { getColumns } from '@startpos-core/components/custom/data-view'
import { TableView } from '@startpos-core/components/custom/data-view/table-view'
import { Button } from '@startpos-core/components/ui/button'
import { invoiceCols } from '@/lib/columns/invoice-columns'

export function InvoicesTab() {
  // TODO: Replace with actual invoice query from database
  // Currently showing mock data for UI demonstration
  const mockInvoices = [
    {
      id: 'inv_001',
      number: 'INV-2024-001',
      date: '2024-01-15',
      dueDate: '2024-02-15',
      amount: 99900, // in cents
      status: 'paid',
      description: 'Monthly subscription - January 2024'
    },
    {
      id: 'inv_002', 
      number: 'INV-2024-002',
      date: '2024-02-15',
      dueDate: '2024-03-15', 
      amount: 99900,
      status: 'paid',
      description: 'Monthly subscription - February 2024'
    },
    {
      id: 'inv_003',
      number: 'INV-2024-003', 
      date: '2024-03-15',
      dueDate: '2024-04-15',
      amount: 99900,
      status: 'pending',
      description: 'Monthly subscription - March 2024'
    }
  ]
  
  // Show empty state for new accounts instead of mock data
  const hasRealInvoices = false // TODO: Check if business has actual invoices
  const invoices = hasRealInvoices ? mockInvoices : []

  // Define columns for the invoices table
  const columns = getColumns<typeof mockInvoices[number]>(h => [
    invoiceCols.invoiceNumber(h),
    invoiceCols.description(h),
    invoiceCols.invoiceDate(h),
    invoiceCols.dueDate(h),
    invoiceCols.invoiceStatus(h),
    invoiceCols.invoiceAmount(h),
    invoiceCols.downloadAction(h),
  ])

  return (
   <div className='px-4 py-1 flex flex-col grow max-w-5xl'>
     <TableView
      data={invoices}
      columns={columns}
      isFetching={false}
      emptyMessage="No invoices found. Invoices will appear here once you have active billing."
    />
   </div>
  )
}
