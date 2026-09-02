import { supplierCollection } from '@platform/db/collections'
import { useLiveQuery } from '@tanstack/react-db'

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
