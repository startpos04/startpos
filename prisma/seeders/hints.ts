/**
 * hints.ts — Hint system seed (Phase A)
 *
 * Seeds 10 starter hints covering the most useful tips across POS, products,
 * reports, settings, and global shortcuts. All upserts are keyed on (title, page)
 * — fully idempotent, safe to re-run at any time.
 *
 * Contents are managed in the DB so platform operators can update them without
 * deployment (Phase C will add the admin UI for this).
 *
 * Source of truth: REGISTRATION_ONBOARDING_PLAN.md §7.6
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: seeder tx type */
import type { PrismaClient } from 'prisma/generated/prisma/client'

export const order = 10

const STARTER_HINTS = [
  // POS tips
  {
    title: 'Quick item search',
    body: 'Start typing a product name to filter instantly — no need to scroll.',
    page: '/pos',
    sortOrder: 10,
  },
  {
    title: 'SC/PWD discounts',
    body: 'Select a customer type on the payment screen to apply SC/PWD discounts automatically.',
    page: '/pos',
    sortOrder: 20,
  },
  // Products tips
  {
    title: 'Bulk variants',
    body: 'Add multiple variants (size, flavor) to a single product from the variants tab.',
    page: '/products',
    sortOrder: 10,
  },
  // Reports tips
  {
    title: 'Export to CSV',
    body: 'Click the download icon on any report to export the data as a CSV file.',
    page: '/sales-reports',
    sortOrder: 10,
  },
  // Inventory tips
  {
    title: 'Low stock alerts',
    body: 'Set a reorder threshold on a variant to get notified when stock runs low.',
    page: '/inventory',
    sortOrder: 10,
  },
  // Settings tips
  {
    title: 'Business type defaults',
    body: 'Your tax and order settings were pre-configured based on your business type. Review them in Settings.',
    page: '/settings',
    sortOrder: 10,
  },
  // Global tips
  {
    title: 'Offline mode',
    body: 'StartPOS works without internet. Transactions sync automatically when you reconnect.',
    page: null,
    sortOrder: 10,
  },
  {
    title: 'Keyboard shortcuts',
    body: "Press '/' anywhere in the POS to focus the search bar instantly.",
    page: null,
    sortOrder: 20,
  },
  {
    title: 'Dark mode',
    body: 'Toggle dark mode from the settings menu or the icon in the top corner.',
    page: null,
    sortOrder: 30,
  },
  {
    title: 'Receipt customisation',
    body: 'Add your business logo and contact details to receipts in Settings → Receipt.',
    page: null,
    sortOrder: 40,
  },
]

export async function Hints(prisma: PrismaClient) {
  console.info('💡 Seeding starter hints...')

  for (const hint of STARTER_HINTS) {
    // Idempotent upsert: key on (title, page) combo
    const existing = await (prisma as any).hint.findFirst({
      where: { title: hint.title, page: hint.page ?? null },
    })

    if (!existing) {
      await (prisma as any).hint.create({
        data: {
          title: hint.title,
          body: hint.body,
          page: hint.page,
          isActive: true,
          sortOrder: hint.sortOrder,
        },
      })
      console.info(`   ✔  Hint "${hint.title}" seeded.`)
    } else {
      console.info(`   –  Hint "${hint.title}" already exists, skipped.`)
    }
  }

  // Seed HINT_FREQUENCY_DAYS and HINT_DISPLAY_SECONDS platform defaults
  const hintConfigs = [
    { key: 'HINT_FREQUENCY_DAYS', value: '1', description: 'Days between showing the same hint to the same user.' },
    { key: 'HINT_DISPLAY_SECONDS', value: '6', description: 'Seconds before a hint auto-dismisses.' },
  ]

  for (const cfg of hintConfigs) {
    const existing = await (prisma as any).systemConfig.findFirst({
      where: { key: cfg.key, businessId: null, branchId: null, userId: null, scope: 'BUSINESS' },
    })

    if (!existing) {
      await (prisma as any).systemConfig.create({
        data: { key: cfg.key, value: cfg.value, scope: 'BUSINESS' },
      })
      console.info(`   ✔  Config "${cfg.key}" = "${cfg.value}" seeded.`)
    } else {
      console.info(`   –  Config "${cfg.key}" already exists, skipped.`)
    }
  }

  console.info(`✅ Hint seed complete (${STARTER_HINTS.length} hints processed).`)
}

export default Hints
