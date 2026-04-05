import { useQuery } from '@tanstack/react-query'
import { crudAPI } from '../prisma-client/crud-api'

export const fetchIngredientOptions = () =>
  useQuery({
    queryKey: ['ingredientOptions'],
    queryFn: async () => {
      const result = await crudAPI.product('findMany', {
        where: {
          type: 'RAW_MATERIAL',
          variantOfId: null,
        },
        include: {
          category: true,
          ingredients: { include: { material: true } },
          allowedAddons: { include: { addon: true } },
          variants: true,
        },
      })

      if (result.isErr()) throw new Error(result.error)
      return result.value.map(item => ({ label: item.name, value: item }))
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })
