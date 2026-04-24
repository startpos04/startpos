import dayjs from '@/lib/dayjs'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQuery } from '@tanstack/react-query'

export const fetchTransactionReport = (from?: string, to?: string) =>
  useQuery({
    queryKey: ['sales-reports-comprehensive', from, to],
    queryFn: async () => {
      const dateFilter =
        from || to
          ? {
              createdAt: {
                ...(from ? { gte: dayjs(from).startOf('day').toISOString() } : {}),
                ...(to ? { lte: dayjs(to).endOf('day').toISOString() } : {}),
              },
            }
          : {}

      const result = await crudAPI.transaction('findMany', {
        where: dateFilter,
        include: {
          order: { include: { items: { include: { variant: { include: { product: true } } } } } },
          cashier: true,
        },
        orderBy: { createdAt: 'desc' },
      })

      if (result.isErr()) throw new Error(result.error)
      return result.value
    },
  })

type TransactionData = ReturnType<typeof fetchTransactionReport>['data']
export type TransactionReport = NonNullable<TransactionData>[number]
