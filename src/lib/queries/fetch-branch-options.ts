import { useLiveQuery } from '@tanstack/react-db'
import { branchCollection } from '@startpos-core/db/collections'

export const fetchBranchOptions = () => {
  const result = useLiveQuery(q => q.from({ branch: branchCollection }))
  return {
    ...result,
    data: result.data?.map(item => ({
      label: item.name,
      value: item.id,
      data: item,
    })),
  }
}
