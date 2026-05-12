import { count, eq, useLiveInfiniteQuery, useLiveQuery } from '@tanstack/react-db'
import type { Notification } from 'prisma/generated/prisma/browser'
import { notificationsCollection } from '@/db/collections'

export function useNotifications(pageSize = 10) {
  const { data: unread } = useLiveQuery(q =>
    q
      .from({ notification: notificationsCollection })
      .where(({ notification }) => eq(notification.isRead, false))
      .groupBy(({ notification }) => notification.isRead)
      .select(({ notification }) => ({
        count: count(notification.id),
      })),
  )

  // Infinite List
  const infiniteQuery = useLiveInfiniteQuery(
    q =>
      q
        .from({ notification: notificationsCollection })
        .orderBy(({ notification }) => notification.createdAt, 'desc')
        .select(({ notification }) => ({
          ...notification,
        })),
    {
      initialPageParam: 0,
      pageSize: pageSize,
      getNextPageParam: (lastPage, allPages) => {
        if (lastPage.length < pageSize) return undefined
        return allPages.length * pageSize
      },
    },
  )

  // Mutation: Mark Single as Read
  const markAsRead = async (data: Notification) => {
    const result = await notificationsCollection.update(data.id, draft => {
      draft.isRead = true
    })

    if (result.error) throw new Error(result.error.message)
    return { value: data, link: data.link }
  }

  // Mutation: Mark All as Read
  const markAllRead = async () => {
    const unreadItems = [...notificationsCollection.values()].filter(n => !n.isRead)
    for (const item of unreadItems) {
      await notificationsCollection.update(item.id, draft => {
        draft.isRead = true
      })
    }
  }
  return {
    unreadCount: unread[0]?.count || 0,
    notifications: infiniteQuery.data,
    infiniteQuery,
    markAsRead,
    markAllRead,
  }
}
