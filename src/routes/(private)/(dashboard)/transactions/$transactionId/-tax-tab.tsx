/**
 * Transaction Tax Tab
 * 
 * Displays tax breakdown, summary, and compliance data
 */

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@startpos-core/components/ui/table'
import { PriceEngine } from '@/lib/conversion/price-engine'
import type { TransactionHistoryItem } from '@/lib/server-fn/fetch-transaction-history'

interface TaxTabProps {
  transaction: TransactionHistoryItem
}

export function TaxTab({ transaction }: TaxTabProps) {
  return (
    <div className='space-y-3'>
      {/* Summary card */}
      <div className='rounded-xl border border-border/50 bg-muted/20 p-3 grid grid-cols-2 gap-x-4 gap-y-2.5'>
        <div>
          <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Total Amount</p>
          <p className='font-mono text-sm font-black text-primary'>{PriceEngine.format(transaction.totalAmount)}</p>
        </div>
        <div>
          <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Tax Amount</p>
          <p className='font-mono text-sm font-bold'>{PriceEngine.format(transaction.taxAmount)}</p>
        </div>
        <div>
          <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Discount</p>
          <p className='font-mono text-sm font-bold'>{PriceEngine.format(transaction.discount)}</p>
        </div>
        <div>
          <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Total Cost</p>
          <p className='font-mono text-sm font-bold'>{PriceEngine.format(transaction.totalCost)}</p>
        </div>
      </div>

      {/* Tax lines */}
      {transaction.taxLines.length > 0 && (
        <div className='rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2'>
          <p className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>Tax Breakdown</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='text-xs font-bold'>Type</TableHead>
                <TableHead className='text-xs font-bold'>Category</TableHead>
                <TableHead className='text-xs font-bold text-right'>Rate</TableHead>
                <TableHead className='text-xs font-bold text-right'>Taxable</TableHead>
                <TableHead className='text-xs font-bold text-right'>Tax</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transaction.taxLines.map(line => (
                <TableRow key={line.id}>
                  <TableCell className='text-xs py-1.5'>{line.type}</TableCell>
                  <TableCell className='text-xs py-1.5'>{line.category}</TableCell>
                  <TableCell className='text-right font-mono text-xs py-1.5'>{line.rate}%</TableCell>
                  <TableCell className='text-right font-mono text-xs py-1.5'>{PriceEngine.format(line.taxableAmount)}</TableCell>
                  <TableCell className='text-right font-mono text-xs font-bold py-1.5'>{PriceEngine.format(line.taxAmount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* SC/PWD compliance data */}
      {transaction.complianceData && Object.keys(transaction.complianceData as object).length > 0 && (
        <div className='rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2'>
          <p className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>Compliance Data</p>
          <div className='grid grid-cols-2 gap-x-4 gap-y-2'>
            {Object.entries(transaction.complianceData as Record<string, unknown>).map(([key, value]) =>
              value ? (
                <div key={key}>
                  <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                  <p className='text-xs font-medium'>{String(value)}</p>
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}
    </div>
  )
}
