import { userCollection } from '@platform/db/collections'
import { useLiveQuery } from '@tanstack/react-db'

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
