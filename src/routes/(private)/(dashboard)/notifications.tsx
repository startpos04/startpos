import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useInView } from '@/hooks/use-in-view'
import dayjs from '@/lib/dayjs'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { BellOff, CheckCheck, Loader2 } from 'lucide-react'

export const Route = createFileRoute('/(private)/(dashboard)/notifications')({
  component: RouteComponent,
})

function RouteComponent() {
  const queryClient = useQueryClient()

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['notifications', 'page'],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const result = await crudAPI.notification('findMany', {
        take: 20,
        orderBy: { createdAt: 'desc' },
        ...(pageParam ? { cursor: { id: pageParam }, skip: 1 } : {}),
      })
      if (result.isErr()) throw new Error(result.error)
      return result.value
    },
    getNextPageParam: lastPage => (lastPage.length === 20 ? lastPage[lastPage.length - 1]?.id : undefined),
  })

  const { ref } = useInView({
    threshold: 0.1,
    onChange: inView => {
      if (inView && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    },
  })

  // 2. Mark All as Read Mutation
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
      // Invalidate both count and list queries
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const notifications = data?.pages.flat() ?? []

  return (
    <div className='space-y-6 flex flex-col grow h-1'>
      <div className='flex items-center justify-between max-w-4xl w-full mx-auto px-4'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>Notifications</h1>
          <p className='text-muted-foreground'>Manage your alerts and system updates.</p>
        </div>
        <Button variant='outline' size='sm' onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
          <CheckCheck className='mr-2 h-4 w-4' />
          Mark all as read
        </Button>
      </div>

      <ScrollArea className='flex-1 min-h-0 w-full'>
        <div className='grid gap-4 max-w-4xl mx-auto py-1 px-4'>
          {isLoading ? (
            <div className='flex flex-col items-center justify-center py-20'>
              <Loader2 className='h-8 w-8 animate-spin text-primary' />
              <p className='mt-2 text-sm text-muted-foreground'>Loading notifications...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-20 border rounded-lg bg-muted/20'>
              <BellOff className='h-10 w-10 text-muted-foreground mb-4' />
              <p className='text-lg font-medium'>No notifications yet</p>
              <p className='text-sm text-muted-foreground'>We'll let you know when something happens.</p>
            </div>
          ) : (
            notifications.map(n => (
              <Link key={n.id} to={n.link!}>
                <Card className={!n.isRead ? 'border-l-4 border-l-primary' : 'opacity-80'}>
                  <CardContent className='p-4 flex items-start gap-4'>
                    <div className='flex-1 space-y-1'>
                      <div className='flex items-center gap-2'>
                        <span className='font-semibold'>{n.title}</span>
                        {!n.isRead && (
                          <Badge variant='default' className='text-[10px] h-4'>
                            New
                          </Badge>
                        )}
                        <span className='text-xs text-muted-foreground ml-auto'>{dayjs(n.createdAt).format('MMM DD, YYYY hh:mm A')}</span>
                      </div>
                      <p className='text-sm text-muted-foreground leading-relaxed'>{n.message}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}

          <div ref={ref} className='h-10 flex justify-center items-center'>
            {isFetchingNextPage && <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
