/**
 * tutorial-definitions.ts
 *
 * Static catalogue of all TutorialDefinitions, organised by TutorialGroup.
 *
 * Adding a new tutorial = adding one object to the right group below.
 * No route file is ever touched. The TutorialEngine reads from this array.
 *
 * Source of truth: REGISTRATION_ONBOARDING_PLAN.md §6.4
 */

import { type TutorialDefinition, TutorialGroup } from './tutorial-types'

export const TUTORIAL_DEFINITIONS: TutorialDefinition[] = [
  // ---------------------------------------------------------------------------
  // SETUP group
  // ---------------------------------------------------------------------------
  {
    id: 'business-name-default',
    group: TutorialGroup.SETUP,
    title: 'Update your business name',
    body: 'Your business name is still set to the default. Update it in Settings so it appears correctly on receipts and reports.',
    ctaLabel: 'Open settings',
    ctaRoute: '/settings',
    page: '/settings',
    condition: ctx => ctx.businessNameIsDefault,
  },

  // ---------------------------------------------------------------------------
  // POS group
  // ---------------------------------------------------------------------------
  {
    id: 'no-products-on-pos',
    group: TutorialGroup.POS,
    title: 'No products yet',
    body: 'Add your first product so you can start processing sales at the POS.',
    ctaLabel: 'Add product',
    ctaRoute: '/products/create',
    page: '/pos',
    condition: ctx => ctx.productCount === 0,
  },
  {
    id: 'no-variants-with-price',
    group: TutorialGroup.POS,
    title: 'Products need prices',
    body: 'You have products but none have a price set. Add prices to your variants so they appear at checkout.',
    ctaLabel: 'Fix products',
    ctaRoute: '/products',
    page: '/pos',
    condition: ctx => ctx.productCount > 0 && ctx.sellableVariantCount === 0,
  },
  {
    id: 'empty-catalogue',
    group: TutorialGroup.POS,
    title: 'Catalogue is empty',
    body: 'Your product catalogue is empty. Add products to start selling.',
    ctaLabel: 'Add product',
    ctaRoute: '/products/create',
    page: '/products',
    condition: ctx => ctx.productCount === 0,
  },
  {
    id: 'no-orders',
    group: TutorialGroup.POS,
    title: 'No orders yet',
    body: "You haven't processed any orders yet. Head to the POS to run your first transaction.",
    ctaLabel: 'Go to POS',
    ctaRoute: '/pos',
    page: '/orders',
    condition: ctx => !ctx.hasOrders,
  },

  // ---------------------------------------------------------------------------
  // INVENTORY group
  // ---------------------------------------------------------------------------
  {
    id: 'no-suppliers',
    group: TutorialGroup.INVENTORY,
    title: 'No suppliers yet',
    body: 'Add your first supplier to start tracking purchases and stock.',
    ctaLabel: 'Add supplier',
    ctaRoute: '/suppliers/create',
    page: '/purchases',
    condition: ctx => ctx.supplierCount === 0,
  },
  {
    id: 'empty-inventory',
    group: TutorialGroup.INVENTORY,
    title: 'Inventory is empty',
    body: 'Your inventory has no stock entries yet. Receive stock to track your product levels.',
    ctaLabel: 'Receive stock',
    ctaRoute: '/purchases',
    page: '/inventory',
    condition: ctx => ctx.inventoryCount === 0,
  },
  {
    id: 'no-tasks',
    group: TutorialGroup.INVENTORY,
    title: 'No tasks yet',
    body: 'Create operational tasks to manage shelf refills, stock counts, and reconciliations.',
    ctaLabel: 'Create task',
    ctaRoute: '/tasks/create',
    page: '/tasks',
    condition: ctx => ctx.taskCount === 0,
  },

  // ---------------------------------------------------------------------------
  // BILLING group
  // ---------------------------------------------------------------------------
  {
    id: 'credits-low',
    group: TutorialGroup.BILLING,
    title: 'Running low on transactions',
    body: 'Your prepaid credit balance is getting low. Top up now to keep processing sales without interruption.',
    ctaLabel: 'View billing',
    ctaRoute: '/billing',
    // Global + billing page
    page: ['/billing', '/dashboard'],
    condition: ctx => ctx.creditBalance !== null && ctx.creditBalance <= ctx.creditLowThreshold,
  },
  {
    id: 'billing-not-connected',
    group: TutorialGroup.BILLING,
    title: 'Credits used up',
    body: 'Your complimentary transactions have been used. Connect a billing method to keep selling.',
    ctaLabel: 'Connect billing',
    ctaRoute: '/billing',
    page: '/billing',
    condition: ctx => ctx.billingConnected === false && ctx.creditBalance !== null && ctx.creditBalance === 0,
  },

  // ---------------------------------------------------------------------------
  // EMPLOYEES group
  // ---------------------------------------------------------------------------
  {
    id: 'solo-team',
    group: TutorialGroup.EMPLOYEES,
    title: "You're the only one here",
    body: 'Invite your staff so they can log in and help run the store.',
    ctaLabel: 'Invite staff',
    ctaRoute: '/employees',
    page: '/employees',
    condition: ctx => ctx.employeeCount <= 1,
  },
]
