// fallow-ignore-file unused-file
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { CacheFirst, NavigationRoute, NetworkFirst, NetworkOnly, Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const isProd = typeof process !== 'undefined' ? process.env['NODE_ENV'] === 'production' : import.meta.env?.MODE === 'production'
const BUILD_ID = process.env['BUILD_ID'] ?? Date.now().toString() // injected at build time

const serwist = new Serwist({
  disableDevLogs: false,
  precacheEntries: isProd ? (self.__SW_MANIFEST ?? []) : [],
  skipWaiting: true,
  clientsClaim: true,
  // 1. Fix: Navigation Preload can cause 500 errors if the server/SW isn't ready.
  // We keep it enabled but ensure the handler below supports it.
  navigationPreload: isProd,
  runtimeCaching: isProd
    ? [
        {
          // 2. Fix: Explicitly handle navigation in Production as a fallback.
          // This prevents "ERR_FAILED" if the precache fails.
          matcher: ({ request }) => request.mode === 'navigate',
          handler: new NetworkFirst({
            cacheName: `pages-cache-${BUILD_ID}`,
          }),
        },
        {
          matcher: ({ url }) => url.host === 'images.unsplash.com',
          handler: new CacheFirst({
            cacheName: 'unsplash-images',
          }),
        },
        {
          matcher: ({ url }) => url.pathname.startsWith('/_serverFn'),
          handler: new NetworkOnly(),
        },
        {
          matcher: ({ request }) => request.destination === 'style' || request.destination === 'image' || request.destination === 'font',
          handler: new CacheFirst({
            cacheName: `static-assets-${BUILD_ID}`,
          }),
        },
      ]
    : [
        {
          // 3. Fix: Pure "Pass-through" for Dev.
          // Using NetworkOnly for EVERYTHING in dev to avoid any caching confusion.
          matcher: () => true,
          handler: new NetworkOnly(),
        },
      ],
})

// 4. Navigation Routing (Only active in Production)
if (isProd) {
  const navigationRoute = new NavigationRoute(serwist.precacheStrategy, {
    allowlist: [/^(?!\/__).*/],
    denylist: [/^\/_serverFn/],
  })

  serwist.registerCapture(navigationRoute)
}

serwist.addEventListeners()

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => !key.includes(BUILD_ID) && !key.startsWith('unsplash')).map(key => caches.delete(key)))),
  )
})
