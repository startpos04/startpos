import { useLiveQuery } from '@tanstack/react-db'
import { supplierCollection } from '@startpos-core/db/collections'

export const fetchSupplierOptions = () => {
  const result = useLiveQuery(q => q.from({ supplier: supplierCollection }))
  return {
    ...result,
    data: result.data?.map(item => ({
      label: item.name,
      value: item.id,
      data: item,
    })),
  }
}
