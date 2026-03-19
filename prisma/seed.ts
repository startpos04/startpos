import { db } from '@/lib/db'
import { initialAccounts } from './seeds/initialAccounts'

async function main() {
  console.log('🌱 Starting database seeding...')

  const arg = process.argv[2]

  if (arg === 'accounts') {
    await initialAccounts(db)
  } else {
    await initialAccounts(db)
  }

  console.log('🏁 Seeding finished successfully.')
}

main()
  .catch(e => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
