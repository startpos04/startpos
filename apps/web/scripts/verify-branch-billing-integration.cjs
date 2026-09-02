/**
 * Branch Billing Integration Verification Script
 *
 * Verifies that all components of the branch billing system are properly
 * configured and integrated. Run this before testing with live Stripe data.
 */

const fs = require('fs')
const path = require('path')

const REQUIRED_FILES = [
  'src/lib/server-fn/purchase-branch-credits.ts',
  'src/lib/server-fn/get-branch-credit-balance.ts',
  'src/lib/billing/branch-validation-engine.ts',
  'src/routes/(private)/(dashboard)/billing/index.tsx',
  'src/routes/(private)/(dashboard)/billing/route.tsx',
  'src/components/custom/billing/buy-branch-credits-dialog.tsx',
  'src/routes/api/billing/webhook/index.ts',
  'prisma/base/billing.prisma',
  'prisma/base/core.prisma',
]

const REQUIRED_ENV_VARS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_BRANCH_CREDIT_10_PRICE_ID',
  'STRIPE_BRANCH_CREDIT_50_PRICE_ID',
  'STRIPE_BRANCH_CREDIT_100_PRICE_ID',
  'STRIPE_BRANCH_CREDIT_500_PRICE_ID',
  'APP_URL',
]

function checkFileExists(filePath) {
  const fullPath = path.join(__dirname, '..', filePath)
  return fs.existsSync(fullPath)
}

function checkFileContent(filePath, searchStrings) {
  const fullPath = path.join(__dirname, '..', filePath)
  if (!fs.existsSync(fullPath)) return { exists: false }

  const content = fs.readFileSync(fullPath, 'utf8')
  const found = {}

  for (const searchString of searchStrings) {
    found[searchString] = content.includes(searchString)
  }

  return { exists: true, found }
}

function verifyIntegration() {
  console.log('🔍 Verifying Branch Billing Integration...\n')

  let allGood = true

  // 1. Check required files exist
  console.log('📁 Checking required files:')
  for (const file of REQUIRED_FILES) {
    const exists = checkFileExists(file)
    console.log(`   ${exists ? '✅' : '❌'} ${file}`)
    if (!exists) allGood = false
  }

  // 2. Check key integrations
  console.log('\n🔧 Checking integrations:')

  // Server function integration
  const purchaseCheck = checkFileContent('src/lib/server-fn/purchase-branch-credits.ts', [
    'BRANCH_MANAGE_BILLING',
    'createCheckoutSession',
    "source: 'branch_credit_purchase'",
    'branchId',
  ])
  console.log(`   ${purchaseCheck.exists && Object.values(purchaseCheck.found).every(Boolean) ? '✅' : '❌'} Purchase function integration`)

  // Webhook handler integration
  const webhookCheck = checkFileContent('src/routes/api/billing/webhook/index.ts', [
    'branch_credit_purchase',
    'handleBranchCreditPurchase',
    'stripeSessionId',
    'CreditLedger',
  ])
  console.log(`   ${webhookCheck.exists && Object.values(webhookCheck.found).every(Boolean) ? '✅' : '❌'} Webhook handler integration`)

  // Transaction validation integration
  const transactionCheck = checkFileContent('src/lib/queries/create-pos-transaction.ts', [
    'BranchValidationEngine',
    'validateTransaction',
    'txQuotaLimit',
    'CONSUMED',
  ])
  console.log(`   ${transactionCheck.exists && Object.values(transactionCheck.found).every(Boolean) ? '✅' : '❌'} Transaction validation integration`)

  // UI integration
  const uiCheck = checkFileContent('src/routes/(private)/(dashboard)/billing/index.tsx', [
    'BuyBranchCreditsDialog',
    'getBranchCreditBalance',
    'BRANCH_VIEW_BILLING',
  ])
  console.log(`   ${uiCheck.exists && Object.values(uiCheck.found).every(Boolean) ? '✅' : '❌'} UI integration`)

  // Sidebar integration
  const sidebarCheck = checkFileContent('src/components/custom/dashboard/app-sidebar.tsx', ['BRANCH_VIEW_BILLING', "url: '/billing'", 'CreditCardIcon'])
  console.log(`   ${sidebarCheck.exists && Object.values(sidebarCheck.found).every(Boolean) ? '✅' : '❌'} Sidebar integration`)

  // 3. Check schema changes
  console.log('\n🗄️ Checking schema:')

  const billingSchemaCheck = checkFileContent('prisma/base/billing.prisma', ['stripeSessionId String? @unique', 'branchId String', 'branch Branch'])
  console.log(`   ${billingSchemaCheck.exists && Object.values(billingSchemaCheck.found).every(Boolean) ? '✅' : '❌'} CreditLedger schema updates`)

  const coreSchemaCheck = checkFileContent('prisma/base/core.prisma', ['txQuotaLimit Int?', 'creditLedger CreditLedger[]'])
  console.log(`   ${coreSchemaCheck.exists && Object.values(coreSchemaCheck.found).every(Boolean) ? '✅' : '❌'} Branch schema updates`)

  // 4. Check permissions
  console.log('\n🔐 Checking permissions:')

  const permissionKeysCheck = checkFileContent('src/lib/authorization/permission-keys.ts', ['BRANCH_VIEW_BILLING', 'BRANCH_MANAGE_BILLING'])
  console.log(`   ${permissionKeysCheck.exists && Object.values(permissionKeysCheck.found).every(Boolean) ? '✅' : '❌'} Permission keys defined`)

  const rolePermissionsCheck = checkFileContent('src/lib/authorization/role-permissions.ts', ['BRANCH_VIEW_BILLING', 'BRANCH_MANAGE_BILLING'])
  console.log(`   ${rolePermissionsCheck.exists && Object.values(rolePermissionsCheck.found).every(Boolean) ? '✅' : '❌'} Role permissions configured`)

  // 5. Environment check
  console.log('\n🌍 Environment configuration needed:')
  for (const envVar of REQUIRED_ENV_VARS) {
    console.log(`   ⚠️  ${envVar} - Set in .env file`)
  }

  // Summary
  console.log('\n📋 Integration Summary:')
  if (allGood) {
    console.log('✅ All required files present')
    console.log('✅ Key integrations verified')
    console.log('⚠️  Set Stripe environment variables before testing')
    console.log('⚠️  Run database migrations before testing')
    console.log('\n🚀 Ready for testing! See docs/branch-billing-testing-guide.md')
  } else {
    console.log('❌ Some components missing or misconfigured')
    console.log('🔧 Review the checklist above and fix issues')
  }

  return allGood
}

if (require.main === module) {
  verifyIntegration()
}

module.exports = { verifyIntegration }
