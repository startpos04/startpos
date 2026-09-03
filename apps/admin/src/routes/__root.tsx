import { NavigationProgress } from '@platform/components/custom/navigation-progress'
import { ThemeProvider } from '@platform/components/custom/theme/theme-provider'
import { useSw } from '@platform/hooks/use-sw'
import { getAuthUser } from '@/lib/better-auth/auth-server'
import { setupAuth } from '@/lib/better-auth/auth-setup'
import { setUser } from '@platform/lib/better-auth/auth-store'
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import { useMemo } from 'react'
import { Toaster } from 'sonner'
import MountManager from '@platform/lib/mount-manager'
import type { AdminRouterContext } from '@/router'
import appCss from '../styles.css?url'

// Register app implementations with the platform package at module load
setupAuth()

export const Route = createRootRouteWithContext<AdminRouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'StartPOS Admin' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'manifest', href: '/manifest.json' },
      { rel: 'apple-touch-icon', href: '/logo192.png' },
    ],
  }),

  beforeLoad: async () => {
    try {
      const user = await getAuthUser()
      setUser(user!, user?.authorization)
      return { user }
    } catch {
      return { user: undefined }
    }
  },

  notFoundComponent: () => (
    <div className='flex flex-col items-center justify-center h-screen gap-4'>
      <h1 className='text-4xl font-bold'>404</h1>
      <p className='text-muted-foreground'>The page you are looking for does not exist.</p>
      <a href='/' className='text-blue-500 underline'>Go Home</a>
    </div>
  ),

  errorComponent: ({ error }) => (
    <div className='p-4 bg-red-100 text-red-700 rounded'>
      <h2 className='font-bold'>Something went wrong</h2>
      <pre className='text-sm mt-2'>{error.message}</pre>
    </div>
  ),

  shellComponent: RootDocument,

  component: () => <Outlet />,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const { user } = Route.useRouteContext()
  useSw()

  useMemo(() => {
    if (user) {
      setUser(user, user.authorization)
    }
  }, [user])

  return (
    <html lang='en' suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider attribute='class' defaultTheme='system' enableSystem>
          <NavigationProgress />
          <MountManager />
          {children}
          <Toaster theme='system' richColors closeButton position='top-right' />
          <Scripts />
        </ThemeProvider>
      </body>
    </html>
  )
}
