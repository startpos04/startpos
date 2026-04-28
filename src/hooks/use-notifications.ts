import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

export function useNotifications(pageSize = 10) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // Unread Count
  const unreadQuery = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const result = await crudAPI.notification('count', {
        where: { isRead: false },
      })
      if (result.isErr()) throw new Error(result.error)
      return result.value
    },
    refetchInterval: 30000,
  })

  // Infinite List
  const infiniteQuery = useInfiniteQuery({
    queryKey: ['notifications', 'list', pageSize],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const result = await crudAPI.notification('findMany', {
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        ...(pageParam ? { cursor: { id: pageParam }, skip: 1 } : {}),
      })
      if (result.isErr()) throw new Error(result.error)
      return result.value
    },
    getNextPageParam: lastPage => (lastPage.length === pageSize ? lastPage[lastPage.length - 1]?.id : undefined),
  })

  // Mutation: Mark Single as Read
  const markAsRead = useMutation({
    mutationFn: async ({ id, link }: { id: string; link?: string | null }) => {
      const result = await crudAPI.notification('update', {
        where: { id },
        data: { isRead: true },
      })
      if (result.isErr()) throw new Error(result.error)
      return { value: result.value, link }
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      if (data.link) {
        navigate({ to: data.link })
      }
    },
  })

  // Mutation: Mark All as Read
  const markAllRead = useMutation({
    mutationFn: async () => {
      const result = await crudAPI.notification('updateMany', {
        where: { isRead: false },
        data: { isRead: true },
      })
      if (result.isErr()) throw new Error(result.error)
      return result.value
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  return {
    unreadCount: unreadQuery.data ?? 0,
    notifications: infiniteQuery.data?.pages.flat() ?? [],
    infiniteQuery,
    markAsRead,
    markAllRead,
  }
}
