import type { Table } from '@tanstack/react-table'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Input } from '@/components/ui/input'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface DataViewPaginationProps<T> {
  table: Table<T>
  totalItems: number // Keep it simple: just pass the total count as a number
}

export function DataViewPagination<T>({ table, totalItems }: DataViewPaginationProps<T>) {
  const [goToPage, setGoToPage] = useState('')

  // 1. Pull everything out of the table state
  const { pageIndex, pageSize } = table.getState().pagination
  const totalPages = table.getPageCount() // TanStack already knows this if configured in the parent!

  const handleGoToPageSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const pageNumber = parseInt(goToPage, 10)
    if (!Number.isNaN(pageNumber) && pageNumber > 0 && pageNumber <= totalPages) {
      table.setPageIndex(pageNumber - 1)
      setGoToPage('')
    }
  }

  const startRow = pageIndex * pageSize + 1
  const endRow = Math.min((pageIndex + 1) * pageSize, totalItems)

  return (
    <div className='flex gap-2 items-center justify-between'>
      {/* Left side text summary */}
      <div className='grow text-xs text-muted-foreground flex items-center gap-2'>
        <span className='font-semibold text-foreground'>Total:</span> {totalItems}
        {totalItems > 0 && (
          <>
            <span className='text-muted'>|</span>
            <span className='font-semibold text-foreground'>
              {startRow} - {endRow}
            </span>{' '}
            <div className='flex gap-1 items-center'>
              Per Page:{' '}
              <Select value={`${pageSize}`} onValueChange={val => table.setPageSize(Number(val))}>
                <SelectTrigger className='w-16'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[20, 50, 100, 250].map(opt => (
                    <SelectItem key={opt} value={`${opt}`}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>

      <div className='flex items-center gap-4'>
        {/* Navigation buttons */}
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                className={!table.getCanPreviousPage() ? 'pointer-events-none opacity-40' : 'cursor-pointer'}
                onClick={() => table.previousPage()}
              />
            </PaginationItem>

            {pageIndex > 1 && (
              <PaginationItem>
                <PaginationLink className='cursor-pointer' onClick={() => table.setPageIndex(0)}>
                  1
                </PaginationLink>
              </PaginationItem>
            )}

            {pageIndex > 2 && <PaginationEllipsis />}

            <PaginationItem>
              <PaginationLink className='cursor-pointer' isActive>
                {pageIndex + 1}
              </PaginationLink>
            </PaginationItem>

            {pageIndex < totalPages - 3 && <PaginationEllipsis />}

            {pageIndex < totalPages - 1 && (
              <PaginationItem>
                <PaginationLink className='cursor-pointer' onClick={() => table.setPageIndex(totalPages - 1)}>
                  {totalPages}
                </PaginationLink>
              </PaginationItem>
            )}

            <PaginationItem>
              <PaginationNext className={!table.getCanNextPage() ? 'pointer-events-none opacity-40' : 'cursor-pointer'} onClick={() => table.nextPage()} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>

        <div className='text-xs text-muted-foreground min-w-max'>
          Total <span className='font-semibold text-foreground'>{totalPages}</span> Pages
        </div>

        {/* Form action to fire dynamic Index jumps */}
        <form onSubmit={handleGoToPageSubmit}>
          <ButtonGroup>
            <Input
              type='number'
              min={1}
              max={totalPages}
              value={goToPage}
              onChange={e => setGoToPage(e.target.value)}
              placeholder={(pageIndex + 1).toString()}
              className='w-14 h-8 text-center text-xs'
            />
            <Button type='submit' size='sm' variant='outline' className='h-8 text-xs' aria-label='Go'>
              GO
            </Button>
          </ButtonGroup>
        </form>
      </div>
    </div>
  )
}
