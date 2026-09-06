/**
 * sync-meta.ts — generates prisma/generated/metadata.ts from the schema.
 *
 * Called by the `generate` script after `prisma generate` runs.
 * Can also be called from apps/web and apps/admin scripts with --schema/--output overrides.
 *
 * Usage:
 *   tsx prisma/sync-meta.ts
 *   tsx prisma/sync-meta.ts --schema=prisma/schema.prisma --output=prisma/generated/metadata.ts
 */

import { getDMMF } from '@prisma/internals'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function getArg(flag: string): string | undefined {
  const arg = process.argv.find(a => a.startsWith(`${flag}=`))
  return arg?.split('=').slice(1).join('=')
}

async function generate() {
  const schemaArg = getArg('--schema')
  const outputArg = getArg('--output')

  // Defaults are relative to this file's own directory (packages/platform/prisma/)
  const schemaPath = schemaArg ? path.resolve(process.cwd(), schemaArg) : path.join(__dirname, 'schema.prisma')

  const outputPath = outputArg ? path.resolve(process.cwd(), outputArg) : path.join(__dirname, 'generated', 'metadata.ts')

  if (!fs.existsSync(schemaPath)) {
    console.error(`❌ Could not find schema at: ${schemaPath}`)
    process.exit(1)
  }

  const schema = fs.readFileSync(schemaPath, 'utf8')
  const dmmf = await getDMMF({ datamodel: schema })

  const modelMetadata: Record<string, unknown> = {}
  dmmf.datamodel.models.forEach(model => {
    modelMetadata[model.name] = {
      relations: Object.fromEntries(model.fields.filter(f => f.kind === 'object').map(f => [f.name, f.type])),
    }
  })

  const content = `// AUTO-GENERATED - DO NOT EDIT\nexport const SCHEMA_METADATA = ${JSON.stringify(modelMetadata, null, 2)} as const;`

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, content)
  console.info(`✅ Metadata synced to ${path.relative(process.cwd(), outputPath)}`)
}

generate().catch(err => {
  console.error('❌ Failed to sync metadata:', err)
  process.exit(1)
})
