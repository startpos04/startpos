import { useLiveQuery } from '@tanstack/react-db'
import { categoryCollection } from '@/db/collections'

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
