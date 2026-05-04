import { ThemeProvider } from '@/components/custom/theme/theme-provider'
import { useSw } from '@/hooks/use-sw'
import { getAuthUser } from '@/lib/better-auth/auth-server' // Import your server function
import { APP_NAME } from '@/lib/constants'
import Overlay from '@/lib/overlay'
import { MyRouterContext } from '@/router'
import { setUser } from '@/store/auth-store'
import { HeadContent, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import { useMemo } from 'react'
import { Toaster } from 'sonner'
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
    const user = await getAuthUser()
    setUser(user!)
    return { user, isAuthenticated: !!user }
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
      setUser(user)
    }
  }, [user])

  return (
    <html lang='en' suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider attribute='class' defaultTheme='system' enableSystem>
          <Overlay />
          {children}
          <Toaster theme='system' richColors closeButton position='top-right' />
          <Scripts />
        </ThemeProvider>
      </body>
    </html>
  )
}
