/**
 * generate-env.ts
 *
 * Merges shared root env vars with app-specific env vars into each app's .env file.
 *
 * Layer order (later layers override earlier ones):
 *   1. web/.env              — shared defaults, committed
 *   2. web/.env.local        — shared local overrides, gitignored
 *   3. apps/<app>/.env.example — app-specific defaults, committed
 *
 * Output: apps/<app>/.env  (gitignored, regenerated on every run)
 *
 * Usage:
 *   pnpm env:generate              — generate all apps
 *   pnpm env:generate apps/web     — generate a specific app only
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ─── Types ────────────────────────────────────────────────────────────────────

type EnvMap = Map<string, { value: string; comment: string | null }>

// ─── Apps to generate ─────────────────────────────────────────────────────────

const APPS: string[] = [
  'apps/web',
  'apps/admin',
]

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseEnvFile(filePath: string): EnvMap {
  const map: EnvMap = new Map()
  if (!existsSync(filePath)) return map

  const lines = readFileSync(filePath, 'utf8').split('\n')
  let pendingComment: string | null = null

  for (const line of lines) {
    const trimmed = line.trim()

    // Blank line resets pending comment
    if (trimmed === '') {
      pendingComment = null
      continue
    }

    // Accumulate comment lines
    if (trimmed.startsWith('#')) {
      pendingComment = pendingComment ? `${pendingComment}\n${line}` : line
      continue
    }

    // Key=value line
    const eqIndex = line.indexOf('=')
    if (eqIndex === -1) {
      pendingComment = null
      continue
    }

    const key = line.slice(0, eqIndex).trim()
    const value = line.slice(eqIndex + 1).trim()

    if (key) {
      map.set(key, { value, comment: pendingComment })
    }

    pendingComment = null
  }

  return map
}

// ─── Merger ───────────────────────────────────────────────────────────────────

function mergeLayers(...layers: EnvMap[]): EnvMap {
  const merged: EnvMap = new Map()
  for (const layer of layers) {
    for (const [key, entry] of layer) {
      merged.set(key, entry)
    }
  }
  return merged
}

// ─── Serialiser ───────────────────────────────────────────────────────────────

function serializeSection(title: string, vars: EnvMap): string {
  if (vars.size === 0) return ''

  const lines: string[] = [
    `# ${'─'.repeat(75 - title.length)} ${title} ─`,
  ]

  for (const [key, { value, comment }] of vars) {
    if (comment) lines.push(comment)
    lines.push(`${key}=${value}`)
  }

  return lines.join('\n')
}

function buildOutput(appPath: string, shared: EnvMap, appSpecific: EnvMap): string {
  const relPath = relative(ROOT, appPath)
  const now = new Date().toISOString()

  const header = [
    `# ${'='.repeat(77)}`,
    `# GENERATED FILE — DO NOT EDIT`,
    `# Run \`pnpm env:generate\` to regenerate.`,
    `#`,
    `# Generated: ${now}`,
    `# App:       ${relPath}`,
    `#`,
    `# Sources:`,
    `#   .env            (shared defaults)`,
    `#   .env.local      (shared local overrides, if present)`,
    `#   ${relPath}/.env.example  (app-specific defaults)`,
    `# ${'='.repeat(77)}`,
  ].join('\n')

  const sections = [
    header,
    serializeSection('SHARED', shared),
    serializeSection('APP-SPECIFIC', appSpecific),
  ].filter(Boolean)

  return sections.join('\n\n') + '\n'
}

// ─── Generator ────────────────────────────────────────────────────────────────

function generateForApp(appRelPath: string): void {
  const appPath = join(ROOT, appRelPath)

  if (!existsSync(appPath)) {
    console.warn(`  ⚠  Skipping ${appRelPath} — directory not found`)
    return
  }

  // Load layers
  const sharedBase    = parseEnvFile(join(ROOT, '.env'))
  const sharedLocal   = parseEnvFile(join(ROOT, '.env.local'))
  const appBase       = parseEnvFile(join(appPath, '.env.example'))

  // Build shared section (root layers merged)
  const shared = mergeLayers(sharedBase, sharedLocal)

  // Build app-specific section (only vars NOT already in shared)
  const appSpecific: EnvMap = new Map()
  for (const [key, entry] of appBase) {
    if (!shared.has(key)) {
      appSpecific.set(key, entry)
    }
  }

  const output = buildOutput(appPath, shared, appSpecific)
  const outPath = join(appPath, '.env')

  writeFileSync(outPath, output, 'utf8')
  console.log(`  ✓  ${appRelPath}/.env (${shared.size} shared + ${appSpecific.size} app-specific vars)`)
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const target = process.argv[2]
const appsToRun = target ? [target] : APPS

console.log('\n🔧 Generating env files...\n')

for (const app of appsToRun) {
  generateForApp(app)
}

console.log('\n✅ Done.\n')
