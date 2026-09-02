// prisma/models/generate-schema.ts
// Schema generator with marker-based field injection
// Supports both interactive (prompts) and non-interactive (CI) modes

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { askQuestion, confirmYesNo, isAutoConfirmEnabled } from '../db-script-utils'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const VALID_COUNTRIES = ['PH', 'SG', 'US'] as const
type Country = (typeof VALID_COUNTRIES)[number]

const COUNTRY_NAMES: Record<Country, string> = {
  PH: 'Philippines',
  SG: 'Singapore',
  US: 'United States',
}

// Output schema goes to apps/web/prisma/ (generated artifact, stays with the app)
const PRISMA_DIR = path.join(__dirname, '..', '..', '..', '..', 'apps', 'web', 'prisma')
// Source models live in platform/prisma/
const MODELS_DIR = path.join(__dirname, '..')

const BASE_FILES = [
  'models/base/_generator.prisma',
  'models/base/_enums.prisma',
  'models/base/core.prisma',
  'models/base/auth.prisma',
  'models/base/transaction.prisma',
  'models/base/order.prisma',
  'models/base/product.prisma',
  'models/base/inventory.prisma',
  'models/base/config.prisma',
  'models/base/branch-capability-config.prisma',
  'models/base/capability-configuration.prisma',
  'models/base/billing.prisma',
  'models/base/permissions.prisma',
  'models/base/operations.prisma',
  'models/base/bos.prisma',
  'models/base/hints.prisma',
  'models/base/production.prisma',
  'models/base/goods-receipt.prisma',
  'models/base/pricing.prisma',
]

const COUNTRY_FILES: Record<Country, string> = {
  PH: 'models/countries/philippines.prisma',
  SG: 'models/countries/singapore.prisma',
  US: 'models/countries/usa.prisma',
}

async function resolveCountry(): Promise<Country> {
  const configured = process.env.DEPLOYMENT_COUNTRY?.trim().toUpperCase()

  if (configured) {
    if (VALID_COUNTRIES.includes(configured as Country)) {
      console.info(`🌍 Using configured country: \x1b[36m${COUNTRY_NAMES[configured as Country]} (${configured})\x1b[0m`)
      return configured as Country
    }
    console.warn(`⚠️  Invalid DEPLOYMENT_COUNTRY="${configured}". Valid options: ${VALID_COUNTRIES.join(', ')}`)
  }

  if (isAutoConfirmEnabled('SCHEMA_AUTO_CONFIRM')) {
    console.info('🤖 AUTO_CONFIRM enabled, defaulting to: \x1b[36mPhilippines (PH)\x1b[0m')
    return 'PH'
  }

  console.info('\n📍 Available deployment countries:')
  console.info('  [PH] Philippines - BIR compliance (TIN, PTU, RDO)')
  console.info('  [SG] Singapore - IRAS compliance (GST, UEN)')
  console.info('  [US] United States - IRS compliance (EIN, State Tax)')

  const countryInput = await askQuestion('\n🌐 Select deployment country [PH/SG/US] (default: PH): ')
  const country = (countryInput.trim().toUpperCase() || 'PH') as Country

  if (!VALID_COUNTRIES.includes(country)) {
    console.error(`❌ Invalid country code: ${countryInput}. Valid options: ${VALID_COUNTRIES.join(', ')}`)
    process.exit(1)
  }

  return country
}

async function main() {
  console.info('\n======================================================')
  console.info('🏗️  PRISMA SCHEMA GENERATION TOOL')
  console.info('======================================================')

  const country = await resolveCountry()
  const countryName = COUNTRY_NAMES[country]

  console.info('\n📋 Generation Summary:')
  console.info(`   Country       : \x1b[36m${countryName} (${country})\x1b[0m`)
  console.info(`   Output File   : \x1b[33mprisma/schema.prisma\x1b[0m`)
  console.info(`   Base Files    : \x1b[90mprisma/models/base/*.prisma\x1b[0m`)
  console.info(`   Country File  : \x1b[90mprisma/models/countries/${country.toLowerCase()}.prisma\x1b[0m`)
  console.info('======================================================\n')

  const confirmed = await confirmYesNo(`Generate Prisma schema for \x1b[36m${countryName} (${country})\x1b[0m? (y/N): `, 'SCHEMA_AUTO_CONFIRM')

  if (!confirmed) {
    console.info('🛑 Schema generation canceled by operator.')
    process.exit(0)
  }

  console.info('\n🔨 Generating country-specific schema...\n')

  try {
    // Read country file and parse injection sections
    const countryFile = COUNTRY_FILES[country]
    const countryPath = path.join(MODELS_DIR, countryFile)

    if (!fs.existsSync(countryPath)) {
      throw new Error(`Country file not found: ${countryFile}`)
    }

    const countryContent = fs.readFileSync(countryPath, 'utf8')

    // Parse injection sections
    const injections: Record<string, string[]> = {}
    const standaloneModels: string[] = []

    let currentModel: string | null = null
    let inStandaloneSection = false

    for (const line of countryContent.split('\n')) {
      // Check for section markers
      if (line.includes('=== INJECT_INTO:')) {
        const match = line.match(/INJECT_INTO:\s+(\w+)/)
        if (match) {
          currentModel = match[1]
          injections[currentModel] = []
          inStandaloneSection = false
        }
      } else if (line.includes('=== STANDALONE MODELS ===')) {
        currentModel = null
        inStandaloneSection = true
      } else if (currentModel && !line.startsWith('//') && line.trim()) {
        // Add field to injection list
        injections[currentModel].push(line)
      } else if (inStandaloneSection) {
        // Add all content (including comments and empty lines) to standalone models
        standaloneModels.push(line)
      }
    }

    console.log(`✓ Parsed ${Object.keys(injections).length} injection targets from ${countryFile}`)
    Object.entries(injections).forEach(([model, fields]) => {
      console.log(`  - ${model}: ${fields.length} fields`)
    })

    // Process base files with injection
    const processedSchemas: string[] = []

    for (const file of BASE_FILES) {
      const filePath = path.join(MODELS_DIR, file)

      if (!fs.existsSync(filePath)) {
        console.warn(`⚠️  Base file not found: ${file} (skipping)`)
        continue
      }

      let content = fs.readFileSync(filePath, 'utf8')

      // Detect which models this file contains and inject fields
      for (const [modelName, fields] of Object.entries(injections)) {
        // Look for the COUNTRY_FIELDS_HERE marker
        const markerPattern = '// COUNTRY_FIELDS_HERE'

        if (content.includes(markerPattern)) {
          // Simple line-by-line replacement to avoid regex complexity with nested braces
          const lines = content.split('\n')
          let modelFound = false

          for (let i = 0; i < lines.length; i++) {
            // Check if we're in the correct model
            if (lines[i].includes(`model ${modelName}`) && lines[i].includes('{')) {
              modelFound = true
            }

            // If we're in the right model and found the marker, inject fields
            if (modelFound && lines[i].includes(markerPattern)) {
              const injectedFields = fields.map(f => `  ${f}`)
              lines[i] = `  // COUNTRY_FIELDS: ${country}\n${injectedFields.join('\n')}`
              console.log(`✓ Injected ${fields.length} fields into ${modelName} (${file})`)
              modelFound = false // Reset for next model
              break
            }

            // Reset if we've left the model (closing brace at root level)
            if (modelFound && lines[i].match(/^}/)) {
              modelFound = false
            }
          }

          content = lines.join('\n')
        }
      }

      processedSchemas.push(content)
    }

    // Combine everything
    const combinedSchema = [
      '// ============================================================================',
      '// GENERATED PRISMA SCHEMA - DO NOT EDIT',
      `// Country: ${country}`,
      `// Generated: ${new Date().toISOString()}`,
      `// Source: base/* + ${path.basename(COUNTRY_FILES[country])}`,
      '// ============================================================================',
      '',
      ...processedSchemas,
      '',
      '// ============================================================================',
      `// COUNTRY-SPECIFIC STANDALONE MODELS: ${country}`,
      '// ============================================================================',
      '',
      ...standaloneModels,
    ].join('\n')

    // Write generated schema
    const outputPath = path.join(PRISMA_DIR, 'schema.prisma')
    fs.writeFileSync(outputPath, combinedSchema)

    console.log(`\n✅ Successfully generated schema.prisma for ${countryName} (${country})`)
    console.log(`📄 Output: ${outputPath}`)
    console.log(`📊 Total size: ${(combinedSchema.length / 1024).toFixed(2)} KB\n`)
  } catch (error) {
    console.error('\n❌ Schema generation failed:')
    console.error(error)
    process.exit(1)
  }
}

main().catch(e => {
  console.error('❌ Schema generation script crashed:', e)
  process.exit(1)
})
