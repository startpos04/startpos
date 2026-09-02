import { categoryCollection } from '@platform/db/collections'
import { useLiveQuery } from '@tanstack/react-db'

export const fetchCategoryOptions = () => {
  const result = useLiveQuery(q => q.from({ category: categoryCollection }))

  return {
    ...result,
    data: result.data?.map(item => ({
      label: item.name,
      value: item.id,
      data: item,
    })),
  }
}
