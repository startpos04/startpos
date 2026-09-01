import { useLiveQuery } from '@tanstack/react-db'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { Building2, CreditCard, Shield, Sparkles, Users } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { branchCollection, userCollection } from '@/db/collections'
import { useCapability } from '@/hooks/use-capability'
import { usePermission } from '@/hooks/use-permission'
import { Permissions } from '@/lib/authorization/permission-keys'
import { Capabilities } from '@/lib/entitlement/capability-keys'
import { authStore } from '@/lib/better-auth/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/business/')({
  component: BusinessOverview,
})

function BusinessOverview() {
  const user = useStore(authStore, state => state.user)
  const business = user?.business
  const canManagePermissions = usePermission(Permissions.USER_MANAGE_PERMISSIONS)

  // Query branch count
  const { data: branches } = useLiveQuery(q => q.from({ branch: branchCollection }))
  const branchCount = branches?.length ?? 0

  // Query user count
  const { data: users } = useLiveQuery(q => q.from({ user: userCollection }))
  const userCount = users?.length ?? 0

  if (!business) {
    return (
      <div className='flex items-center justify-center h-full'>
        <p className='text-muted-foreground'>No business found</p>
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-6 p-6'>
      {/* Header */}
      <div className='flex flex-col gap-2'>
        <h1 className='text-3xl font-bold'>Business Overview</h1>
        <p className='text-muted-foreground'>Manage your business settings, branches, billing, and more</p>
      </div>

      {/* Stats Cards */}
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
        {/* Business Info Card */}
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Business</CardTitle>
            <Building2 className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold truncate'>{business.name}</div>
            <p className='text-xs text-muted-foreground mt-1'>{business.businessType}</p>
          </CardContent>
        </Card>

        {/* Branches Card */}
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Branches</CardTitle>
            <Building2 className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{branchCount}</div>
            <p className='text-xs text-muted-foreground mt-1'>Active branches</p>
          </CardContent>
        </Card>

        {/* Users Card */}
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Team Members</CardTitle>
            <Users className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{userCount}</div>
            <p className='text-xs text-muted-foreground mt-1'>Total users</p>
          </CardContent>
        </Card>

        {/* Subscription Card */}
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Subscription</CardTitle>
            <CreditCard className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{user.entitlement?.status || 'N/A'}</div>
            <p className='text-xs text-muted-foreground mt-1'>Current status</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Manage your business settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
            <QuickActionCard
              title='Capabilities'
              description='Enable or disable features'
              icon={<Sparkles className='h-6 w-6' />}
              href='/business/capabilities'
            />
            <QuickActionCard title='Branches' description='Manage your branches' icon={<Building2 className='h-6 w-6' />} href='/business/branches' />
            <QuickActionCard title='Subscription' description='Manage plans and billing' icon={<CreditCard className='h-6 w-6' />} href='/business/subscription' />
            {canManagePermissions && (
              <QuickActionCard title='Permissions' description='Manage user permissions' icon={<Shield className='h-6 w-6' />} href='/business/permissions' />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function QuickActionCard({ title, description, icon, href }: { title: string; description: string; icon: React.ReactNode; href: string }) {
  return (
    <a href={href} className='flex items-start gap-4 p-4 rounded-lg border hover:bg-accent transition-colors'>
      <div className='p-2 rounded-lg bg-primary/10 text-primary'>{icon}</div>
      <div className='flex flex-col gap-1'>
        <h3 className='font-semibold'>{title}</h3>
        <p className='text-sm text-muted-foreground'>{description}</p>
      </div>
    </a>
  )
}
