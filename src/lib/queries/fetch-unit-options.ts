import { useLiveQuery } from '@tanstack/react-db'
import { unitCollection } from '@startpos-core/db/collections'

export const fetchUnitOptions = () => {
  const result = useLiveQuery(q => q.from({ unit: unitCollection }))
  return {
    ...result,
    data: result.data?.map(item => ({
      label: `${item.name} (${item.abbreviation})`,
      value: item.id,
      data: item,
    })),
  }
}
