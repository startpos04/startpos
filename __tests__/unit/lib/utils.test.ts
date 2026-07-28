/**
 * utils.test.ts
 *
 * Tests for the cn() class name utility (clsx + tailwind-merge).
 *
 * Coverage:
 *  - Merges multiple class strings
 *  - Handles conditional classes (truthy/falsy values)
 *  - Deduplicates conflicting Tailwind classes (tailwind-merge behaviour)
 *  - Handles arrays and objects
 *  - Returns empty string for no/falsy inputs
 *
 * Run with: pnpm test
 */

import { describe, expect, it } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn (class name utility)', () => {
  it('joins multiple string classes', () => {
    expect(cn('foo', 'bar', 'baz')).toBe('foo bar baz')
  })

  it('returns empty string for no arguments', () => {
    expect(cn()).toBe('')
  })

  it('ignores falsy values (undefined, null, false, empty string)', () => {
    expect(cn('foo', undefined, null, false, '', 'bar')).toBe('foo bar')
  })

  it('handles object syntax: includes keys with truthy values', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz')
  })

  it('handles array syntax', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar')
  })

  it('deduplicates conflicting Tailwind classes (tailwind-merge)', () => {
    // tailwind-merge keeps the last conflicting class
    expect(cn('p-2', 'p-4')).toBe('p-4')
    expect(cn('text-sm', 'text-lg')).toBe('text-lg')
  })

  it('merges conditional Tailwind classes correctly', () => {
    const isActive = true
    const isDisabled = false
    expect(cn('base-class', isActive && 'active', isDisabled && 'disabled')).toBe('base-class active')
  })

  it('handles mixed strings, objects, and arrays', () => {
    expect(cn('a', ['b', 'c'], { d: true, e: false })).toBe('a b c d')
  })

  it('preserves non-conflicting Tailwind classes', () => {
    expect(cn('flex', 'items-center', 'gap-4')).toBe('flex items-center gap-4')
  })
})
