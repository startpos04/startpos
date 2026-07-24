import { QueryClient } from '@tanstack/react-query'

let globalQueryClient: QueryClient | null = null

export function getQueryClient() {
  // If rendering on the server (SSR), always return a fresh instance per request
  if (typeof window === 'undefined') {
    return new QueryClient({
      defaultOptions: {
        queries: { staleTime: 1000 * 60 },
      },
    })
  }

  // On the browser client, keep re-using the exact same singleton instance
  if (!globalQueryClient) {
    globalQueryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: Infinity, // Perfect for local-first architecture
          gcTime: 1000 * 60 * 60 * 24,
          refetchOnWindowFocus: false,
          refetchOnMount: false,
        },
      },
    })
  }

  return globalQueryClient
}
