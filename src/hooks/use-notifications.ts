import { count, eq, useLiveInfiniteQuery, useLiveQuery } from '@tanstack/react-db'
import type { Notification } from 'prisma/generated/prisma/browser'
import { toast } from 'sonner'
import { notificationCollection } from '@/db/collections'
import { LocalDBTransaction } from '@/db/local-db-transaction'

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
    const localDBTransaction = new LocalDBTransaction()
    try {
      await localDBTransaction.step(
        notificationCollection.update(data.id, draft => {
          draft.isRead = true
        }),
      )

      return { value: data, link: data.link }
    } catch (error) {
      console.error('Transaction failed:', error)
      toast.error('Failed to mark notification as read. Please try again.')

      return null
    }
  }

  // Mutation: Mark All as Read
  const markAllRead = async () => {
    const unreadItems = [...notificationCollection.values()].filter(n => !n.isRead)
    for (const item of unreadItems) {
      await notificationCollection.update(item.id, draft => {
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
