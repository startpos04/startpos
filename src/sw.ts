import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { CacheFirst, NavigationRoute, NetworkFirst, NetworkOnly, Serwist, StaleWhileRevalidate } from 'serwist'

// 1. Correct Global Scope Typing
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const isProd = process.env['NODE_ENV'] === 'production'

const serwist = new Serwist({
  disableDevLogs: !isProd,
  precacheEntries: isProd ? (self.__SW_MANIFEST ?? []) : [],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: isProd,
  // 2. Runtime Caching solves the "No route found" warnings
  runtimeCaching: isProd
    ? [
        {
          // 1. Handle Unsplash Images (Cross-Origin)
          matcher: ({ url }) => url.host === 'images.unsplash.com',
          handler: new CacheFirst({
            cacheName: 'unsplash-images',
            plugins: [
              // It's good practice to add an expiration for external assets
              // so you don't fill up the user's storage indefinitely.
            ],
          }),
        },
        {
          // 2. Handle Server Functions
          matcher: ({ url }) => url.pathname.startsWith('/_serverFn'),
          handler: new NetworkOnly(),
        },
        {
          // 3. Existing Local Assets
          matcher: ({ request }) => request.destination === 'style' || request.destination === 'image' || request.destination === 'font',
          handler: new CacheFirst({
            cacheName: 'static-assets',
          }),
        },
        {
          matcher: ({ request }) => request.destination === 'script' || request.destination === 'worker',
          handler: new StaleWhileRevalidate({
            cacheName: 'js-chunks',
          }),
        },
      ]
    : [
        {
          // For Dev: Try network first so you see fresh changes.
          // If network fails (offline), fall back to cache.
          matcher: ({ request }) => request.mode === 'navigate' || request.destination === 'script',
          handler: new NetworkFirst({
            cacheName: 'dev-offline-backup',
          }),
        },
        {
          // Keep server functions NetworkOnly even in dev
          matcher: ({ url }) => url.pathname.startsWith('/_serverFn'),
          handler: new NetworkOnly(),
        },
      ],
})

// 3. Navigation Routing
if (isProd) {
  const navigationRoute = new NavigationRoute(serwist.precacheStrategy, {
    // Allow all routes except those starting with /__ (internal)
    allowlist: [/^(?!\/__).*/],
    // Prevent the navigation handler from trying to handle server functions
    denylist: [/^\/_serverFn/],
  })

  serwist.registerCapture(navigationRoute)
}
serwist.addEventListeners()
