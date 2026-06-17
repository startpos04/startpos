// fallow-ignore-file unused-file
import { spawnSync } from 'node:child_process'

// Get current branch name using standard Node child_process
const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
  encoding: 'utf8', // This automatically converts stdout to string
})

const branch = result.stdout?.trim()

const protectedBranches = ['main']

if (branch && protectedBranches.includes(branch)) {
  console.info(`\n\x1b[31m❌ PROTECTED BRANCH: ${branch}\x1b[0m`)
  console.info('──────────────────────────────────────────────────────')
  console.info(`Direct actions on "${branch}" are restricted.`)
  console.info('Please use a feature branch (e.g., feat/my-task).')
  console.info('──────────────────────────────────────────────────────\n')
  process.exit(1)
}

process.exit(0)
