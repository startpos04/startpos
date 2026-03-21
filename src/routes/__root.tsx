import { ThemeProvider } from '@/components/custom/theme/theme-provider'
import { geAuthUser } from '@/lib/better-auth/auth-server' // Import your server function
import Overlay from '@/lib/Overlay'
import { MyRouterContext } from '@/router'
import { HeadContent, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import appCss from '../styles.css?url'

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
        <ThemeProvider attribute='class' defaultTheme='system' enableSystem>
          <Overlay />
          {children}
          <Scripts />
        </ThemeProvider>
      </body>
    </html>
  )
}
