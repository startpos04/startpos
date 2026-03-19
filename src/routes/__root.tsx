import { geAuthUser } from '@/lib/better-auth/auth-server' // Import your server function
import { HeadContent, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import appCss from '../styles.css?url'

interface MyRouterContext {
  user: Awaited<ReturnType<typeof geAuthUser>> | undefined
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'POS & Inventory System' }],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),

  beforeLoad: async () => {
    const user = await geAuthUser()
    return { user }
  },

  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en'>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
