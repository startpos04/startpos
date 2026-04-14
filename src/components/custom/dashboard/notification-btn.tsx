import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import dayjs from '@/lib/dayjs'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Bell, Loader2 } from 'lucide-react'

export function NotificationButton() {
  const navigate = useNavigate()

  const { data: unreadCount = 0 } = useQuery({
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

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['notifications', 'infinite'],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const result = await crudAPI.notification('findMany', {
        take: 10,
        orderBy: { createdAt: 'desc' },
        ...(pageParam ? { cursor: { id: pageParam }, skip: 1 } : {}),
      })

      if (result.isErr()) throw new Error(result.error)
      return result.value
    },
    getNextPageParam: lastPage => (lastPage.length === 10 ? lastPage[lastPage.length - 1]?.id : undefined),
  })

  const allNotifications = data?.pages.flat() ?? []

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon' className='relative'>
          <Bell className='h-5! w-5!' />
          {unreadCount > 0 && (
            <span className='absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground'>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-96'>
        <DropdownMenuLabel className='flex justify-between items-center'>
          Notifications
          {isLoading && <Loader2 className='h-3 w-3 animate-spin' />}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <div
          className='max-h-80 overflow-y-auto overflow-x-hidden'
          onScroll={e => {
            const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
            // If scrolled to within 10px of the bottom
            if (scrollHeight - scrollTop <= clientHeight + 10 && hasNextPage && !isFetchingNextPage) {
              fetchNextPage()
            }
          }}
        >
          {allNotifications.length === 0 && !isLoading ? (
            <div className='p-8 text-center text-xs text-muted-foreground'>No notifications yet.</div>
          ) : (
            allNotifications.map(n => (
              <Link key={n.id} to={n.link!}>
                <DropdownMenuItem className='flex flex-col items-start gap-1 p-4 whitespace-normal cursor-pointer'>
                  <div className='flex justify-between w-full gap-2'>
                    <span className={`text-sm ${!n.isRead ? 'font-bold' : 'font-semibold'}`}>{n.title}</span>
                    {!n.isRead && <div className='h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1' />}
                  </div>
                  <p className='text-xs text-muted-foreground line-clamp-2'>{n.message}</p>
                  <span className='text-[10px] text-muted-foreground/70 mt-1'>{dayjs(n.createdAt).format('MMM DD, YYYY hh:mm A')}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </Link>
            ))
          )}

          {isFetchingNextPage && (
            <div className='p-2 flex justify-center'>
              <Loader2 className='h-4 w-4 animate-spin text-muted-foreground' />
            </div>
          )}
        </div>

        <DropdownMenuItem
          className='w-full text-center justify-center text-primary font-medium cursor-pointer'
          onClick={() => navigate({ to: '/notifications' })}
        >
          View all notifications
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
