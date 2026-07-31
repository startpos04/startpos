import { count, eq, useLiveInfiniteQuery, useLiveQuery } from '@tanstack/react-db'
import type { Notification } from 'prisma/generated/prisma/browser'
import { toast } from 'sonner'
import { notificationCollection } from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'

export function useNotifications(pageSize = 10) {
  const { data: unread } = useLiveQuery(q =>
    q
      .from({ notification: notificationCollection })
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
        .from({ notification: notificationCollection })
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
    try {
      notificationCollection.update(data.id, draft => {
        draft.isRead = true
      })

      return { value: data, link: data.link }
    } catch (error) {
      console.error('notification failed:', error)
      toast.error('Failed to mark notification as read. Please try again.')

      return null
    }
  }

  // Mutation: Mark All as Read
  const markAllRead = () => {
    // DEV-3: Batch all updates in a single transaction — O(1) sync operations
    // instead of O(n) individual async awaits. Each update is a synchronous
    // Immer draft mutation; dbTransaction commits them atomically.
    const unreadIds = [...notificationCollection.values()].filter(n => !n.isRead).map(n => n.id)

    if (unreadIds.length === 0) return

    dbTransaction(() => {
      for (const id of unreadIds) {
        notificationCollection.update(id, draft => {
          draft.isRead = true
        })
      }
    })
  }
  return {
    unreadCount: unread[0]?.count || 0,
    notifications: infiniteQuery.data,
    infiniteQuery,
    markAsRead,
    markAllRead,
  }
}
