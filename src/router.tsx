import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { geAuthUser } from './lib/better-auth/auth-server'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

type AuthUser = Awaited<ReturnType<typeof geAuthUser>> | undefined

export interface MyRouterContext {
  queryClient: QueryClient
  user: AuthUser
}
export const getRouter = () => {
  const queryClient = new QueryClient()

  const router = createRouter({
    routeTree,
    context: { queryClient, user: undefined },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  })

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
