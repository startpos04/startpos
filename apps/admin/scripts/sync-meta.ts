import pkg from '@prisma/internals'
import fs from 'fs'
import path from 'path'

const { getDMMF } = pkg

async function generate() {
  // Use process.cwd() to ensure we find the file regardless of where the script is called from
  const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma')

  if (!fs.existsSync(schemaPath)) {
    console.error(`❌ Could not find schema at: ${schemaPath}`)
    return
  }

  const schema = fs.readFileSync(schemaPath, 'utf8')

  // Parse the schema using the DMMF engine
  const dmmf = await getDMMF({ datamodel: schema })

  const modelMetadata: Record<string, unknown> = {}

  dmmf.datamodel.models.forEach(model => {
    modelMetadata[model.name] = {
      // Map the relation field name to the actual Model name
      relations: Object.fromEntries(model.fields.filter(f => f.kind === 'object').map(f => [f.name, f.type])),
    }
  })

  const outputPath = path.join(process.cwd(), 'prisma', '/generated/metadata.ts')
  const content = `// AUTO-GENERATED - DO NOT EDIT\nexport const SCHEMA_METADATA = ${JSON.stringify(modelMetadata, null, 2)} as const;`

  fs.writeFileSync(outputPath, content)
  console.info('✅ Metadata synced successfully to prisma/generated/metadata.ts')
}

generate().catch(err => {
  console.error('❌ Failed to sync metadata:', err)
  process.exit(1)
})
