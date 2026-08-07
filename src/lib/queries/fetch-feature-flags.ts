/**
 * fetch-feature-flags.ts
 *
 * Exposes safe, non-secret feature flags to the client.
 * Only boolean flags that control UI behaviour are exposed here —
 * never secrets, keys, or user data.
 */

import { createServerFn } from '@tanstack/react-start'

export type FeatureFlags = {
  emailVerificationEnabled: boolean
}

export const fetchFeatureFlags = createServerFn({ method: 'GET' }).handler(
  async (): Promise<FeatureFlags> => ({
    // Default to true — verification is on unless explicitly disabled
    emailVerificationEnabled: process.env['ENABLE_EMAIL_VERIFICATION'] !== 'false',
  }),
)
