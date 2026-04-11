import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { NavigationRoute, Serwist } from 'serwist'

// 1. Correct Global Scope Typing
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST ?? [],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
})

const navigationRoute = new NavigationRoute(serwist.precacheStrategy, {
  allowlist: [/^(?!\/__).*/],
})

serwist.registerCapture(navigationRoute)
serwist.addEventListeners()
