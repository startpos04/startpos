import { useQuery } from '@tanstack/react-query'
import { crudAPI } from '../prisma-client/crud-api'

export const fetchIngredients = () =>
  useQuery({
    queryKey: ['ingredients'],
    queryFn: async () => {
      return await crudAPI({
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
              ingredients: { include: { material: true } },
              allowedAddons: { include: { addon: true } },
              variants: true,
            },
          },
        },
      })
    },
  })
