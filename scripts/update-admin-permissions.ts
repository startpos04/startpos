import { prisma } from '../startpos-core/lib/prisma-client'

async function updateAdminPermissions() {
  try {
    console.log('Adding BUSINESS_VIEW_PROFILE permission to ADMIN role...')

    // Find the permission
    const permission = await prisma.permission.findUnique({
      where: { key: 'business:view:profile' },
    })

    if (!permission) {
      console.error('Permission business:view:profile not found!')
      await prisma.$disconnect()
      process.exit(1)
    }

    // Check if role permission already exists
    const existing = await prisma.roleDefaultPermission.findUnique({
      where: {
        role_permissionId: {
          role: 'ADMIN',
          permissionId: permission.id,
        },
      },
    })

    if (existing) {
      console.log('✓ Permission already exists for ADMIN role')
    } else {
      // Create the role permission
      await prisma.roleDefaultPermission.create({
        data: {
          role: 'ADMIN',
          permissionId: permission.id,
        },
      })
      console.log('✓ Successfully added BUSINESS_VIEW_PROFILE permission to ADMIN role')
    }

    await prisma.$disconnect()
  } catch (error) {
    console.error('Error:', error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

updateAdminPermissions()
