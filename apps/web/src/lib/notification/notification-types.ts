/**
 * notification-types.ts
 *
 * Type-safe schemas for notification metadata using Zod.
 * Ensures metadata fields are properly validated at runtime.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Low Stock Notification Metadata
// ---------------------------------------------------------------------------

export const LowStockMetadataSchema = z.object({
  variantId: z.string(),
  currentTotal: z.number(),
})

export type LowStockMetadata = z.infer<typeof LowStockMetadataSchema>

// ---------------------------------------------------------------------------
// Credit Low Balance Notification Metadata
// ---------------------------------------------------------------------------

export const CreditLowBalanceMetadataSchema = z.object({
  currentBalance: z.number(),
  threshold: z.number(),
})

export type CreditLowBalanceMetadata = z.infer<typeof CreditLowBalanceMetadataSchema>

// ---------------------------------------------------------------------------
// Usage Threshold Notification Metadata
// ---------------------------------------------------------------------------

export const UsageThresholdMetadataSchema = z.object({
  resource: z.enum(['TRANSACTIONS', 'CREDITS']),
  thresholdType: z.enum(['absolute', 'percentage']),
  thresholdValue: z.number(),
  currentUsage: z.number(),
  periodStart: z.string(),
  periodEnd: z.string(),
})

export type UsageThresholdMetadata = z.infer<typeof UsageThresholdMetadataSchema>

// ---------------------------------------------------------------------------
// Union schema for all notification metadata types
// ---------------------------------------------------------------------------

export const NotificationMetadataSchema = z.union([
  LowStockMetadataSchema,
  CreditLowBalanceMetadataSchema,
  UsageThresholdMetadataSchema,
  z.record(z.unknown()), // Fallback for other notification types
])

export type NotificationMetadata = z.infer<typeof NotificationMetadataSchema>
