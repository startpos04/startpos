/**
 * router-wrapper.tsx
 *
 * Minimal TanStack Router v1 test wrapper for Vitest + RTL integration tests.
 *
 * Why not use the real routeTree?
 *   - routeTree.gen.ts imports __root.tsx which calls getAuthUser() (server fn)
 *     in beforeLoad — that crashes in jsdom.
 *   - We build a flat inline router with just the route under test so
 *     useSearch, useNavigate, Link, and Route.useNavigate all work.
 *
 * Usage:
 *   const { wrapper } = createTestRouter('/tasks', { search: '' })
 *   render(<TasksPage />, { wrapper })
 *
 * Or for components that access route context via Route.useNavigate():
 *   const router = buildRouter(TasksPage, '/tasks', { search: '' })
 *   render(<RouterProvider router={router} />)
 */

import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import React from 'react'

type SearchParams = Record<string, unknown>
type LoaderData = Record<string, unknown>

/**
 * Build a minimal in-memory test router with a single route at the given path.
 * The component is rendered when the router navigates to that path.
 */
export function buildRouter(
  component: () => ReactNode,
  path: string,
  initialSearch: SearchParams = {},
  loaderData: LoaderData = {},
) {
  const rootRoute = createRootRoute()

  const testRoute = createRoute({
    getParentRoute: () => rootRoute,
    path,
    component: component as React.FC,
    validateSearch: (search: Record<string, unknown>) => ({ ...initialSearch, ...search }),
    loader: () => loaderData,
  })

  const routeTree = rootRoute.addChildren([testRoute])

  // Build the initial URL with search params if provided
  const searchString = Object.keys(initialSearch).length
    ? '?' + new URLSearchParams(Object.entries(initialSearch).map(([k, v]) => [k, String(v)])).toString()
    : ''

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`${path}${searchString}`] }),
  })

  return router
}

/**
 * Returns a React wrapper component that provides RouterProvider context.
 * Use with RTL's render({ wrapper }) option.
 *
 * Example:
 *   const wrapper = routerWrapper(MyPage, '/my-path')
 *   render(<div />, { wrapper })
 *   // Or more commonly:
 *   render(<RouterProvider router={buildRouter(MyPage, '/my-path')} />)
 */
export function routerWrapper(
  component: () => ReactNode,
  path: string,
  initialSearch: SearchParams = {},
  loaderData: LoaderData = {},
) {
  const router = buildRouter(component, path, initialSearch, loaderData)
  return function Wrapper({ children: _ }: { children?: ReactNode }) {
    return <RouterProvider router={router} />
  }
}
