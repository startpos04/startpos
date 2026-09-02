import { Badge } from '@platform/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@platform/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@platform/components/ui/table'
import { cn } from '@platform/lib/utils'
import type { InventoryData } from '..'

export function StockLevels({ inventoryData }: { inventoryData: InventoryData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock Levels & Valuation</CardTitle>
        <CardDescription>Detailed breakdown of physical goods and raw materials.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Current Stock</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Batch Info</TableHead>
              <TableHead className='text-right'>Asset Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inventoryData.map(product => {
              const totalQty = product.variants.reduce((acc, v) => acc + v.inventory.reduce((iq, i) => iq + i.quantity, 0), 0)
              const assetValue = product.variants.reduce((acc, v) => acc + v.inventory.reduce((iq, i) => iq + i.quantity * i.costPrice, 0), 0)

              return (
                <TableRow key={product.id}>
                  <TableCell className='font-medium'>
                    <div className='flex flex-col'>
                      <span>{product.name}</span>
                      <span className='text-xs text-muted-foreground'>{product.category.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant='outline'>{product.type}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className={cn(totalQty < 10 ? 'text-rose-600 font-bold' : '')}>{totalQty.toLocaleString()}</span>
                  </TableCell>
                  <TableCell>{product.baseUnit.abbreviation}</TableCell>
                  <TableCell>
                    <div className='flex gap-1'>
                      {product.hasExpiry && (
                        <Badge variant='secondary' className='text-[10px]'>
                          Exp. Tracking
                        </Badge>
                      )}
                      {product.requiresDeposit && (
                        <Badge variant='secondary' className='text-[10px] bg-blue-50'>
                          Deposit
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className='text-right'>â‚±{(assetValue / 100).toLocaleString()}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
