import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { CacheFirst, NavigationRoute, NetworkFirst, NetworkOnly, Serwist, StaleWhileRevalidate } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
    __SW_LAZY_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const isProd = typeof process !== 'undefined' ? process.env['NODE_ENV'] === 'production' : import.meta.env?.MODE === 'production'

const BUILD_ID = typeof process !== 'undefined' ? (process.env['BUILD_ID'] ?? 'dev') : 'dev'
const LAZY_CACHE_NAME = `lazy-precache-${BUILD_ID}`
const LAZY_BATCH_SIZE = 6
const LAZY_BATCH_DELAY_MS = 400
const COMPLETE_MARKER_URL = '/__lazy_precache_complete__'

// A background run is already in flight — prevents overlapping runs if,
// e.g., an 'online' event and a client message both fire close together.
let precacheInFlight = false

const serwist = new Serwist({
  disableDevLogs: false,
  precacheEntries: isProd ? (self.__SW_MANIFEST ?? []) : [], // shell only — fast install
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: isProd,
  runtimeCaching: isProd
    ? [
        {
          matcher: ({ request }) => request.mode === 'navigate',
          handler: new NetworkFirst({ cacheName: 'pages-cache', networkTimeoutSeconds: 4 }),
        },
        {
          matcher: ({ url }) => url.host === 'images.unsplash.com',
          handler: new CacheFirst({ cacheName: 'unsplash-images' }),
        },
        {
          matcher: ({ url }) => url.pathname.startsWith('/_serverFn'),
          handler: new NetworkOnly(),
        },
        {
          // Reads the SAME cache the background job below fills, so whichever
          // fills a given file first — a real visit, or the background job —
          // benefits the other.
          matcher: ({ request, url }) => request.destination === 'script' && !url.pathname.includes('opfs-worker'),
          handler: new StaleWhileRevalidate({ cacheName: LAZY_CACHE_NAME }),
        },
        {
          matcher: ({ request }) => request.destination === 'style' || request.destination === 'image' || request.destination === 'font',
          handler: new CacheFirst({ cacheName: 'static-assets' }),
        },
        {
          // Fetched fresh on demand, never SW-cached — large, and only needed
          // once the offline DB actually initializes.
          matcher: ({ url }) => url.pathname.includes('opfs-worker'),
          handler: new NetworkOnly(),
        },
      ]
    : [{ matcher: () => true, handler: new NetworkOnly() }],
})

if (isProd) {
  const navigationRoute = new NavigationRoute(serwist.precacheStrategy, {
    allowlist: [/^(?!\/__).*/],
    denylist: [/^\/_serverFn/],
  })
  serwist.registerCapture(navigationRoute)
}

serwist.addEventListeners()

// ---------------------------------------------------------------------------
// Background full-app precache — runs once per deployment, never blocks the
// SW lifecycle or the initial page load.
//
// Invariant: the completion marker is written IF AND ONLY IF every entry in
// the lazy manifest is verified present in the cache afterward. A partial
// run (network hiccup, going offline mid-run) leaves no marker, so the next
// trigger (client message, 'online' event) retries — fetching only what's
// still missing, since already-cached entries are skipped.
// ---------------------------------------------------------------------------
async function backgroundPrecacheRest(): Promise<void> {
  if (!isProd) return
  if (precacheInFlight) return
  precacheInFlight = true

  try {
    const manifest = self.__SW_LAZY_MANIFEST ?? []
    if (manifest.length === 0) return

    const cache = await caches.open(LAZY_CACHE_NAME)

    // Already fully completed for this build — instant no-op.
    if (await cache.match(COMPLETE_MARKER_URL)) return

    const urls = manifest.map(entry => (typeof entry === 'string' ? entry : entry.url))

    for (let i = 0; i < urls.length; i += LAZY_BATCH_SIZE) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        console.info('[SW] Lazy precache paused — offline. Will resume on next trigger.')
        return // no marker written — next trigger retries remaining files
      }

      const batch = urls.slice(i, i + LAZY_BATCH_SIZE)

      await Promise.all(
        batch.map(async url => {
          if (await cache.match(url)) return // already cached — idempotent

          try {
            const response = await fetch(url, { cache: 'no-cache' })
            if (response.ok) await cache.put(url, response)
            // non-ok response: leave uncached, verification pass below catches it
          } catch {
            // network error — leave uncached, verification pass below catches it
          }
        }),
      )

      await new Promise(resolve => setTimeout(resolve, LAZY_BATCH_DELAY_MS))
    }

    // Verification pass: only write the completion marker if EVERY manifest
    // entry is actually present in the cache now. This is the fix for the
    // bug where a partial failure could still result in a marker being
    // written — that must never happen.
    const missing: string[] = []
    for (const url of urls) {
      if (!(await cache.match(url))) missing.push(url)
    }

    if (missing.length > 0) {
      console.info(`[SW] Lazy precache incomplete — ${missing.length} file(s) still missing. Will retry on next trigger.`)
      return
    }

    await cache.put(COMPLETE_MARKER_URL, new Response('done'))
    console.info('[SW] Lazy precache complete for build', BUILD_ID)
  } finally {
    precacheInFlight = false
  }
}

// Activate stays fast: only sweeps stale per-build caches from prior
// deployments. Lazy precaching is deliberately NOT started here — it's
// triggered by the client (see useSw.ts) once the page has actually loaded,
// so it can never be the thing standing between a deploy and a usable app.
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter(key => key.startsWith('lazy-precache-') && key !== LAZY_CACHE_NAME).map(key => caches.delete(key)))
    })(),
  )
})

self.addEventListener('message', event => {
  if (event.data === 'start-lazy-precache' || event.data === 'retry-lazy-precache') {
    event.waitUntil(backgroundPrecacheRest())
  }
})
