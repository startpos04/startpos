import { NavigationProgress } from '@platform/components/custom/navigation-progress'
import { ThemeProvider } from '@platform/components/custom/theme/theme-provider'
import { useSw } from '@platform/hooks/use-sw'
import { PersistenceWarning } from '@/components/persistence-warning'
import { getAuthUser } from '@/lib/better-auth/auth-server'
import { setupAuth } from '@/lib/better-auth/auth-setup'
import { setUser } from '@/lib/better-auth/auth-store'

// Register app's getAuthUser with the platform package at module load
setupAuth()

import { APP_NAME } from '@platform/lib/constants'
import MountManager from '@platform/lib/mount-manager'
import { createRootRouteWithContext, HeadContent, Scripts } from '@tanstack/react-router'
import { useMemo } from 'react'
import { Toaster } from 'sonner'
import type { MyRouterContext } from '@/router'
import appCss from '../styles.css?url'

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: `${APP_NAME} System` }],
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

  notFoundComponent: () => {
    return (
      <div className='flex flex-col items-center justify-center h-screen'>
        <h1 className='text-4xl font-bold'>404</h1>
        <p>The page you are looking for does not exist.</p>
        <a href='/' className='mt-4 text-blue-500 underline'>
          Go Home
        </a>
      </div>
    )
  },

  errorComponent: ({ error }) => {
    return (
      <div className='p-4 bg-red-100 text-red-700'>
        <h2 className='font-bold'>Something went wrong!</h2>
        <pre className='text-sm'>{error.message}</pre>
      </div>
    )
  },

  shellComponent: RootDocument,
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
          <PersistenceWarning />
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
