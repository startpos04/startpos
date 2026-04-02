import { useQuery } from '@tanstack/react-query'
import { crudAPI } from '../prisma-client/crud-api'

export const fetchIngredients = () =>
  useQuery({
    queryKey: ['ingredients'],
    queryFn: async () => {
      const result = await crudAPI({
        data: {
          action: 'findMany',
          table: 'product',
          args: {
            where: {
              type: 'RAW_MATERIAL',
              variantOfId: null,
            },
            include: {
              category: true,
              allowedAddons: { include: { addon: true } },
              inventory: true,
              baseUnit: true,
              variants: true,
            },
          },
        },
      })

      if (result.isErr()) throw new Error(result.error)
      return result.value
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

type IngredientData = ReturnType<typeof fetchIngredients>['data']
export type feIngredient = NonNullable<IngredientData>[number]
