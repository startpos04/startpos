/**
 * Type-safe JSON parsing utilities using Zod schemas
 *
 * Usage:
 * ```typescript
 * import { typedJsonParse, safeJsonParse } from '@startpos-core/lib/json-utils'
 * import { UserSchema } from '@/schemas/user.schema'
 *
 * // Throws on invalid data
 * const user = typedJsonParse(jsonString, UserSchema)
 *
 * // Returns result object
 * const result = safeJsonParse(jsonString, UserSchema)
 * if (result.success) {
 *   console.log(result.data)
 * } else {
 *   console.error(result.error)
 * }
 * ```
 */

import type { z } from 'zod'

/**
 * Parse JSON with runtime type validation (throws on error)
 */
export function typedJsonParse<T>(json: string, schema: z.ZodSchema<T>): T {
  const parsed: unknown = JSON.parse(json)
  return schema.parse(parsed)
}

/**
 * Parse JSON with runtime type validation (safe, returns result)
 */
export function safeJsonParse<T>(json: string, schema: z.ZodSchema<T>): { success: true; data: T } | { success: false; error: string } {
  try {
    const parsed: unknown = JSON.parse(json)
    const validated = schema.parse(parsed)
    return { success: true, data: validated }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown parsing error',
    }
  }
}

/**
 * Stringify with runtime type validation before serialization
 */
export function typedJsonStringify<T>(data: T, schema: z.ZodSchema<T>): string {
  const validated = schema.parse(data)
  return JSON.stringify(validated)
}

/**
 * Stringify with runtime type validation (safe, returns result)
 */
export function safeJsonStringify<T>(data: T, schema: z.ZodSchema<T>): { success: true; json: string } | { success: false; error: string } {
  try {
    const validated = schema.parse(data)
    return { success: true, json: JSON.stringify(validated) }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown validation error',
    }
  }
}

/**
 * Type guard for checking if a value matches a schema
 */
export function matchesSchema<T>(value: unknown, schema: z.ZodSchema<T>): value is T {
  return schema.safeParse(value).success
}

/**
 * Parse JSON from localStorage with fallback
 */
export function parseLocalStorage<T>(key: string, schema: z.ZodSchema<T>, fallback: T): T {
  try {
    const item = localStorage.getItem(key)
    if (!item) return fallback

    const result = safeJsonParse(item, schema)
    return result.success ? result.data : fallback
  } catch {
    return fallback
  }
}

/**
 * Set JSON to localStorage with validation
 */
export function setLocalStorage<T>(key: string, value: T, schema: z.ZodSchema<T>): boolean {
  try {
    const validated = schema.parse(value)
    localStorage.setItem(key, JSON.stringify(validated))
    return true
  } catch (error) {
    console.error(`Failed to save ${key} to localStorage:`, error)
    return false
  }
}
