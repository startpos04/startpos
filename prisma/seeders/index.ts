import { db } from '@/lib/db'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Get the current file name to avoid self-importing
const __filename = fileURLToPath(import.meta.url)
const CURRENT_FILE = path.basename(__filename)

async function main() {
  const arg = process.argv[2]
  const seedersDir = path.dirname(__filename) // Or specify a subfolder like path.join(path.dirname(__filename), 'seeders')

  // Read files and filter out the entry point + non-script files
  const files = fs
    .readdirSync(seedersDir)
    .filter(file => {
      const isScript = file.endsWith('.ts') || file.endsWith('.js')
      const isCurrentFile = file === CURRENT_FILE || file === 'index.ts'
      return isScript && !isCurrentFile && !file.includes('.test.')
    })
    .sort()

  console.log('🌱 Starting dynamic database seeding...')

  for (const file of files) {
    const fileName = path.parse(file).name

    // Determine if we should run this specific file
    const shouldRun = !arg || arg === 'all' || arg === fileName || arg === file

    if (shouldRun) {
      console.log(` -> Executing: ${file}`)

      try {
        const filePath = path.join(seedersDir, file)
        // Adding a cache-buster version if needed, but standard dynamic import works fine
        const module = await import(`file://${filePath}`)

        // Use the first exported function found in the file
        const seederTask = module.default || Object.values(module).find(val => typeof val === 'function')

        if (typeof seederTask === 'function') {
          await seederTask(db)
        } else {
          console.warn(`⚠️  Skipping ${file}: No exportable function found.`)
        }
      } catch (err) {
        console.error(`❌ Failed to seed ${file}:`, err)
        throw err
      }
    }
  }

  console.log('🏁 All tasks finished.')
}

main()
  .catch(e => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
