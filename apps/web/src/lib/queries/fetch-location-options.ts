import { locationCollection } from '@platform/db/collections'
import { useLiveQuery } from '@tanstack/react-db'

export const fetchLocationOptions = () => {
  const result = useLiveQuery(q => q.from({ location: locationCollection }))
  return {
    ...result,
    data: result.data?.map(item => ({
      label: item.name,
      value: item.id,
      data: item,
    })),
  }
}
