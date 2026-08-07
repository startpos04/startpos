import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import Tab from '@/components/custom/tab'
import { RequireCapability } from '@/components/require-capability'
import { Capabilities } from '@/lib/entitlement/capability-keys'
import { AccountPage } from './-account'
import { BusinessProfilePage } from './-business-profile'
import { CapabilitiesPage } from './-capabilities'
import { CategoriesPage } from './-categories'
import { CustomersPage } from './-customers'
import { LocationsPage } from './-locations'
import { SecurityPage } from './-security'
import { SuppliersPage } from './-suppliers'
import { UnitsPage } from './-units'

const searchSchema = z.object({
  tab: z.string().optional(),
})

export const Route = createFileRoute('/(private)/(dashboard)/settings/')({
  validateSearch: searchSchema,
  component: RouteComponent,
})

const TABS = [
  { label: 'Units', Component: UnitsPage },
  { label: 'Categories', Component: CategoriesPage },
  { label: 'Locations', Component: LocationsPage },
  {
    label: 'Suppliers',
    Component: () => (
      <RequireCapability cap={Capabilities.MANAGE_SUPPLIERS} inline={false}>
        <SuppliersPage />
      </RequireCapability>
    ),
  },
  {
    label: 'Customers',
    Component: () => (
      <RequireCapability cap={Capabilities.MANAGE_CUSTOMERS} inline={false}>
        <CustomersPage />
      </RequireCapability>
    ),
  },
  { label: 'Capabilities', Component: CapabilitiesPage },
  { label: 'Business Profile', Component: BusinessProfilePage },
  { label: 'Security', Component: SecurityPage },
  { label: 'Account', Component: AccountPage },
] as const

const VALID_TABS = new Set(TABS.map(t => t.label))

function RouteComponent() {
  const { tab } = Route.useSearch()
  const defaultValue = tab && VALID_TABS.has(tab) ? tab : 'Units'

  return <Tab defaultValue={defaultValue} className='grow h-1' tabClass='px-4' tabs={[...TABS]} />
}
