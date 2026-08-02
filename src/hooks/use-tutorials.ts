/**
 * use-tutorials.ts
 *
 * useTutorials(page) — assembles TutorialContext from offline collections
 * and returns active tutorials for the current page, filtered by session
 * dismissals.
 *
 * Architecture:
 *   - Reads from offline collections (no extra server calls per page load).
 *   - Calls TutorialEngine.evaluate — pure, no infrastructure.
 *   - Filters out IDs in tutorialStore.dismissed.
 *   - Reactive: collection changes (e.g. product added) trigger re-evaluation.
 */

import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tanstack/react-store'
import { useMemo } from 'react'
import {
  inventoryCollection,
  operationalTaskCollection,
  orderCollection,
  productCollection,
  productVariantCollection,
  supplierCollection,
  userCollection,
} from '@/db/collections'
import { TutorialEngine } from '@/lib/tutorial/tutorial-engine'
import { tutorialStore } from '@/lib/tutorial/tutorial-store'
import type { TutorialContext } from '@/lib/tutorial/tutorial-types'
import { authStore } from '@/store/auth-store'

// Default threshold if not set in systemConfigs
const DEFAULT_LOW_BALANCE_THRESHOLD = 10

export function useTutorials(page: string) {
  const user = useStore(authStore, state => state.user)
  const dismissed = useStore(tutorialStore, state => state.dismissed)

  // Read counts from offline collections — reactive via useLiveQuery
  const products = useLiveQuery(q => q.from({ p: productCollection }).select(({ p }) => p))
  const variants = useLiveQuery(q => q.from({ v: productVariantCollection }).select(({ v }) => v))
  const users = useLiveQuery(q => q.from({ u: userCollection }).select(({ u }) => u))
  const orders = useLiveQuery(q => q.from({ o: orderCollection }).select(({ o }) => o))
  const inventory = useLiveQuery(q => q.from({ i: inventoryCollection }).select(({ i }) => i))
  const tasks = useLiveQuery(q => q.from({ t: operationalTaskCollection }).select(({ t }) => t))
  const suppliers = useLiveQuery(q => q.from({ s: supplierCollection }).select(({ s }) => s))

  const tutorials = useMemo(() => {
    // Wait for all collections to be ready
    if (!products.isReady || !variants.isReady || !users.isReady || !orders.isReady || !inventory.isReady || !tasks.isReady || !suppliers.isReady) {
      return []
    }

    const businessName = user?.business?.name ?? ''
    // Default pattern: "{DisplayName}'s Business"
    const isDefaultName = businessName === '' || /^.+'s Business$/.test(businessName) || businessName === 'My Business'

    const subscription = user?.entitlement
    const creditLowThreshold =
      (user?.systemConfigs?.['CREDIT_LOW_BALANCE_THRESHOLD' as keyof typeof user.systemConfigs] as number | undefined) ?? DEFAULT_LOW_BALANCE_THRESHOLD

    const context: TutorialContext = {
      productCount: products.data?.length ?? 0,
      sellableVariantCount: (variants.data ?? []).filter(v => (v.price ?? 0) > 0).length,
      employeeCount: users.data?.length ?? 0,
      hasOrders: (orders.data?.length ?? 0) > 0,
      businessNameIsDefault: isDefaultName,
      billingConnected: false, // Phase A: no Stripe integration yet
      creditBalance: subscription?.creditBalance ?? null,
      creditLowThreshold,
      supplierCount: suppliers.data?.length ?? 0,
      inventoryCount: inventory.data?.length ?? 0,
      taskCount: tasks.data?.length ?? 0,
    }

    const active = TutorialEngine.evaluate(page, context)
    // Filter out session-dismissed tutorials
    return active.filter(t => !dismissed.has(t.id))
  }, [
    page,
    dismissed,
    user,
    products.isReady,
    products.data,
    variants.isReady,
    variants.data,
    users.isReady,
    users.data,
    orders.isReady,
    orders.data,
    inventory.isReady,
    inventory.data,
    tasks.isReady,
    tasks.data,
    suppliers.isReady,
    suppliers.data,
  ])

  return tutorials
}

/**
 * useTutorialContext — builds the raw TutorialContext for pages that need
 * access to it directly (e.g. SetupChecklist on /dashboard).
 */
export function useTutorialContext(): TutorialContext | null {
  const user = useStore(authStore, state => state.user)

  const products = useLiveQuery(q => q.from({ p: productCollection }).select(({ p }) => p))
  const variants = useLiveQuery(q => q.from({ v: productVariantCollection }).select(({ v }) => v))
  const users = useLiveQuery(q => q.from({ u: userCollection }).select(({ u }) => u))
  const orders = useLiveQuery(q => q.from({ o: orderCollection }).select(({ o }) => o))
  const inventory = useLiveQuery(q => q.from({ i: inventoryCollection }).select(({ i }) => i))
  const tasks = useLiveQuery(q => q.from({ t: operationalTaskCollection }).select(({ t }) => t))
  const suppliers = useLiveQuery(q => q.from({ s: supplierCollection }).select(({ s }) => s))

  return useMemo(() => {
    if (!products.isReady || !variants.isReady || !users.isReady || !orders.isReady || !inventory.isReady || !tasks.isReady || !suppliers.isReady) {
      return null
    }

    const businessName = user?.business?.name ?? ''
    const isDefaultName = businessName === '' || /^.+'s Business$/.test(businessName) || businessName === 'My Business'

    const subscription = user?.entitlement
    const creditLowThreshold =
      (user?.systemConfigs?.['CREDIT_LOW_BALANCE_THRESHOLD' as keyof typeof user.systemConfigs] as number | undefined) ?? DEFAULT_LOW_BALANCE_THRESHOLD

    return {
      productCount: products.data?.length ?? 0,
      sellableVariantCount: (variants.data ?? []).filter(v => (v.price ?? 0) > 0).length,
      employeeCount: users.data?.length ?? 0,
      hasOrders: (orders.data?.length ?? 0) > 0,
      businessNameIsDefault: isDefaultName,
      billingConnected: false,
      creditBalance: subscription?.creditBalance ?? null,
      creditLowThreshold,
      supplierCount: suppliers.data?.length ?? 0,
      inventoryCount: inventory.data?.length ?? 0,
      taskCount: tasks.data?.length ?? 0,
    }
  }, [
    user,
    products.isReady,
    products.data,
    variants.isReady,
    variants.data,
    users.isReady,
    users.data,
    orders.isReady,
    orders.data,
    inventory.isReady,
    inventory.data,
    tasks.isReady,
    tasks.data,
    suppliers.isReady,
    suppliers.data,
  ])
}
