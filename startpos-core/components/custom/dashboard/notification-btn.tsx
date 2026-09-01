import { Link, useNavigate } from '@tanstack/react-router'
import { Bell, CheckCheck, Loader2 } from 'lucide-react'
import { Button } from '@startpos-core/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@startpos-core/components/ui/dropdown-menu'
import { useNotifications } from '@startpos-core/hooks/use-notifications'
import dayjs from '@startpos-core/lib/dayjs'
import { cn } from '@startpos-core/lib/utils'

export function NotificationButton() {
  const navigate = useNavigate()
  const { unreadCount, notifications, infiniteQuery, markAsRead, markAllRead } = useNotifications(10)
  const { fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = infiniteQuery

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon-lg' className='relative'>
          <Bell />
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
          {unreadCount > 0 && (
            <Button
              variant='ghost'
              size='sm'
              className='h-auto p-1 text-xs font-normal text-muted-foreground hover:text-primary'
              onClick={e => {
                e.stopPropagation()
                markAllRead()
              }}
            >
              <CheckCheck className='mr-1 size-3' />
              Mark all as read
            </Button>
          )}
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
          {notifications.length === 0 && !isLoading ? (
            <div className='p-8 text-center text-xs text-muted-foreground'>No notifications yet.</div>
          ) : (
            notifications.map(n => (
              <Link key={n.id} to={n.link!}>
                <DropdownMenuItem
                  className='flex flex-col items-start gap-1 p-4 whitespace-normal cursor-pointer'
                  onClick={() => (!n.isRead ? markAsRead(n) : navigate({ to: n.link! }))}
                >
                  <div className='flex justify-between w-full gap-2'>
                    <span className={cn('text-sm', !n.isRead ? 'font-bold' : 'font-semibold')}>{n.title}</span>
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
