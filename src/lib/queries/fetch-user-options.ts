import { useLiveQuery } from '@tanstack/react-db'
import { userCollection } from '@/db/collections'

export const fetchUserOptions = () => {
  const result = useLiveQuery(q => q.from({ user: userCollection }))
  return {
    ...result,
    data: result.data?.map(item => ({
      label: item.name,
      value: item.id,
      data: item,
    })),
  }
}
