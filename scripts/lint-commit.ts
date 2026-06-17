// fallow-ignore-file unused-file
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const commitMsgFile = process.argv[2]

if (!commitMsgFile) {
  console.error('No commit message file provided.')
  process.exit(1)
}

let currentMsg = ''
try {
  currentMsg = readFileSync(commitMsgFile, 'utf8').trim()
} catch (_e) {
  currentMsg = 'your commit message'
}

// 1. Run commitlint
const result = spawnSync('pnpm', ['exec', 'commitlint', '--edit', commitMsgFile], {
  shell: true,
  stdio: 'pipe',
})

if (result.status !== 0) {
  console.info(result.stdout?.toString())
  console.info(result.stderr?.toString())

  // --- FIX: Extract core message if it already has a type prefix ---
  // This prevents "feat: feat: message" suggestions
  const cleanMsg = currentMsg.includes(':') ? currentMsg.split(':').slice(1).join(':').trim() : currentMsg

  console.info('\n\x1b[31m%s\x1b[0m', '❌ INVALID COMMIT MESSAGE FORMAT')
  console.info('\x1b[36m%s\x1b[0m', '──────────────────────────────────────────────────────')

  console.info(`Your message: \x1b[31m"${currentMsg}"\x1b[0m`)

  console.info('\n\x1b[33m%s\x1b[0m', '💡 Try one of these instead:')
  console.info(`   \x1b[32mfeat: ${cleanMsg}\x1b[0m  \x1b[90m(if this is a new feature)\x1b[0m`)
  console.info(`   \x1b[32mfix: ${cleanMsg}\x1b[0m   \x1b[90m(if this is a bug fix)\x1b[0m`)
  console.info(`   \x1b[32mchore: ${cleanMsg}\x1b[0m \x1b[90m(if this is a config/maintenance task)\x1b[0m`)

  console.info('\n\x1b[35m%s\x1b[0m', '📋 All valid types:')
  console.info('\x1b[90mfeat, fix, chore, docs, style, refactor, perf, test, build, ci, revert\x1b[0m')

  console.info('\x1b[36m%s\x1b[0m', '──────────────────────────────────────────────────────')
  console.info('Format: <type>: <description>')

  process.exit(1)
}

// 2. Run Spell Check (CSpell)
// We use --stdin to check the message directly
const spellResult = spawnSync('pnpm', ['cspell', 'stdin', '--no-progress', '--no-summary'], {
  input: currentMsg,
  shell: true,
  stdio: 'pipe',
})

if (spellResult.status !== 0) {
  console.info('\n\x1b[31m%s\x1b[0m', '❌ SPELLING ERROR IN COMMIT MESSAGE')
  console.info('\x1b[36m%s\x1b[0m', '──────────────────────────────────────────────────────')
  console.info(spellResult.stdout?.toString())
  console.info('\x1b[33m%s\x1b[0m', '💡 Tip: Add project-specific words to .vscode/settings.json under "cSpell.words"')
  console.info('\x1b[36m%s\x1b[0m', '──────────────────────────────────────────────────────')
  process.exit(1)
}

console.info('\x1b[32m%s\x1b[0m', '✅ Commit message looks good!')
process.exit(0)
