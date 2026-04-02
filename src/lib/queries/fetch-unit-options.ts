import { useQuery } from '@tanstack/react-query'
import { crudAPI } from '../prisma-client/crud-api'

export const fetchUnitOptions = () =>
  useQuery({
    queryKey: ['unitOptions'],
    queryFn: async () => {
      const result = await crudAPI({
        data: {
          action: 'findMany',
          table: 'unit',
        },
      })

      if (result.isErr()) throw new Error(result.error)
      return result.value.map(item => ({ label: `${item.name} (${item.abbreviation})`, value: item.id }))
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })
