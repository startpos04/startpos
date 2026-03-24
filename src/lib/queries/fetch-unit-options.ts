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

      return result.map(item => ({ label: item.name, value: item.id }))
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })
