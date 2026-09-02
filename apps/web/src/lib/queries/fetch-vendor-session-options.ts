import { userCollection, vendorSessionCollection } from '@platform/db/collections'
import { eq, useLiveQuery } from '@tanstack/react-db'

export const fetchVendorSessionOptions = () => {
  const result = useLiveQuery(q =>
    q
      .from({ vendorSession: vendorSessionCollection })
      .leftJoin({ user: userCollection }, ({ vendorSession, user }) => eq(vendorSession.userId, user.id))
      .select(({ vendorSession, user }) => ({ ...vendorSession, user })),
  )
  return {
    ...result,
    data: result.data?.map(item => ({
      label: item.user.name || '',
      value: item.id,
      data: item,
    })),
  }
}
