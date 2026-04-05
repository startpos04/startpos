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

  const modelMetadata: Record<string, any> = {}

  dmmf.datamodel.models.forEach(model => {
    modelMetadata[model.name] = {
      hasOrg: model.fields.some(f => f.name === 'organizationId'),
      hasBranch: model.fields.some(f => f.name === 'branchId'),
      // Map the relation field name to the actual Model name
      relations: model.fields.filter(f => f.kind === 'object').reduce((acc, f) => ({ ...acc, [f.name]: f.type }), {}),
    }
  })

  const outputPath = path.join(process.cwd(), 'prisma', 'metadata.ts')
  const content = `// AUTO-GENERATED - DO NOT EDIT\nexport const SCHEMA_METADATA = ${JSON.stringify(modelMetadata, null, 2)} as const;`

  fs.writeFileSync(outputPath, content)
  console.log('✅ Metadata synced successfully to prisma/metadata.ts')
}

generate().catch(err => {
  console.error('❌ Failed to sync metadata:', err)
  process.exit(1)
})
