/**
 * fetch-business-profile.ts — Fetches living characteristics + health stage
 * for the Business Profile settings page.
 *
 * Uses crudAPI (Priority 2) for the server-authoritative read.
 * Returns the LivingCharacteristics JSON merged with source/evidence metadata
 * so the UI can show each field with its origin and staleness info.
 */

import { Permissions } from '@platform/lib/authorization/permission-keys'
import { requirePermission } from '@platform/lib/better-auth/permission-middleware'
import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { getTenantContext, requireTenantContext } from '@/lib/better-auth/server-context'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { getStaleIntentFields } from '../evolution/intent-expiry-checker'
import type { CharacteristicSource, LivingCharacteristics, SourcedValue } from '../evolution/types'
import { DEFAULT_CHARACTERISTICS } from '../onboarding/defaults'
import type { BusinessCharacteristics } from '../onboarding/types'

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/** A single characteristic field ready for the profile editor UI */
export type ProfileFieldRow = {
  field: keyof BusinessCharacteristics
  value: BusinessCharacteristics[keyof BusinessCharacteristics]
  source: CharacteristicSource | 'DEFAULT'
  confidence: number
  evidence: string | null
  observedAt: Date | null
  /** Human-readable source label shown in the UI */
  sourceLabel: string
  /** Whether this field is currently stale (confidence = 0) */
  isDecayed: boolean
}

export type StaleIntentPrompt = {
  field: keyof BusinessCharacteristics
  label: string
  monthsAgo: number
  prompt: string
}

export type BusinessProfileData = {
  characteristics: ProfileFieldRow[]
  healthStage: string | null
  currentProfile: string | null
  staleIntentPrompts: StaleIntentPrompt[]
}

// ---------------------------------------------------------------------------
// Source label map
// ---------------------------------------------------------------------------

const SOURCE_LABELS: Record<CharacteristicSource | 'DEFAULT', string> = {
  ADMIN_DECISION: 'Set by you',
  SYSTEM_CONFIG: 'Based on your settings',
  USAGE_OBSERVATION: 'Based on your activity',
  BUSINESS_EVENT: 'Based on your activity',
  SURVEY_ANSWER: 'From your survey',
  AI_INFERENCE: 'Suggested by the platform',
  DEFAULT: 'Default value',
}

// ---------------------------------------------------------------------------
// Server function
// ---------------------------------------------------------------------------

export const fetchBusinessProfile = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_VIEW_PROFILE), requireTenantContext()])
  .handler(async ({ context }): Promise<BusinessProfileData> => {
    const { businessId } = getTenantContext(context).user

    const result = await crudAPI.business('findUnique', {
      where: { id: businessId },
      select: {
        livingCharacteristics: true,
        healthStage: true,
        currentProfile: true,
      },
    })

    if (result.isErr()) {
      return { characteristics: [], healthStage: null, currentProfile: null, staleIntentPrompts: [] }
    }

    const row = result.value as {
      livingCharacteristics: unknown
      healthStage: string | null
      currentProfile: string | null
    } | null

    if (!row) {
      return { characteristics: [], healthStage: null, currentProfile: null, staleIntentPrompts: [] }
    }

    const living = (row.livingCharacteristics ?? {}) as LivingCharacteristics
    const now = new Date()

    // Build per-field rows by iterating over DEFAULT_CHARACTERISTICS keys
    const characteristics: ProfileFieldRow[] = (Object.keys(DEFAULT_CHARACTERISTICS) as Array<keyof BusinessCharacteristics>).map(field => {
      const sourced = living[field] as SourcedValue<unknown> | undefined
      const defaultValue = DEFAULT_CHARACTERISTICS[field]

      if (!sourced) {
        return {
          field,
          value: defaultValue,
          source: 'DEFAULT',
          confidence: 1,
          evidence: null,
          observedAt: null,
          sourceLabel: SOURCE_LABELS['DEFAULT'],
          isDecayed: false,
        }
      }

      return {
        field,
        value: sourced.value as BusinessCharacteristics[typeof field],
        source: sourced.source,
        confidence: sourced.confidence,
        evidence: sourced.evidence ?? null,
        observedAt: sourced.observedAt,
        sourceLabel: SOURCE_LABELS[sourced.source],
        isDecayed: sourced.confidence === 0,
      }
    })

    // Stale intent prompts
    const staleIntentFields = getStaleIntentFields(living, now)
    const staleIntentPrompts: StaleIntentPrompt[] = staleIntentFields.map(s => ({
      field: s.field,
      label: s.label,
      monthsAgo: s.monthsAgo,
      prompt: s.prompt,
    }))

    return {
      characteristics,
      healthStage: row.healthStage,
      currentProfile: row.currentProfile,
      staleIntentPrompts,
    }
  })
