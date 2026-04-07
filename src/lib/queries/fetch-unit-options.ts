import { useQuery } from '@tanstack/react-query'
import { crudAPI } from '../prisma-client/crud-api'

export const fetchUnitOptions = () =>
  useQuery({
    queryKey: ['unitOptions'],
    queryFn: async () => {
      const result = await crudAPI.unit('findMany')

      if (result.isErr()) throw new Error(result.error)
      return result.value.map(item => ({ label: `${item.name} (${item.abbreviation})`, value: item.id, data: item }))
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })
