import { useQuery } from '@tanstack/react-query'
import { crudAPI } from '../prisma-client/crud-api'

export const fetchCategoryOptions = () =>
  useQuery({
    queryKey: ['categoryOptions'],
    queryFn: async () => {
      const result = await crudAPI({
        data: {
          action: 'findMany',
          table: 'category',
        },
      })

      return result.map(item => ({ label: item.name, value: item.id }))
    },
  })
