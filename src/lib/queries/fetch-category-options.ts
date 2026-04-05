import { useQuery } from '@tanstack/react-query'
import { crudAPI } from '../prisma-client/crud-api'

export const fetchCategoryOptions = () =>
  useQuery({
    queryKey: ['categoryOptions'],
    queryFn: async () => {
      const result = await crudAPI.category('findMany')

      if (result.isErr()) throw new Error(result.error)
      return result.value.map(item => ({ label: item.name, value: item.id }))
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })
