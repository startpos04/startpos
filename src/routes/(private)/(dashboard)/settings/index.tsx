import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import Tab from '@/components/custom/tab'
import { RequireCapability } from '@/components/require-capability'
import { Capabilities } from '@/lib/entitlement/capability-keys'
import { useCapability } from '@/hooks/use-capability'
import { AccountPage } from './-account'
import { BranchesPage } from './-branches'
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

function RouteComponent() {
  const { tab } = Route.useSearch()
  const hasInventory = useCapability(Capabilities.MANAGE_INVENTORY)
  const hasSuppliers = useCapability(Capabilities.MANAGE_SUPPLIERS)
  const hasCustomers = useCapability(Capabilities.MANAGE_CUSTOMERS)
  const hasBranches = useCapability(Capabilities.MANAGE_BRANCHES)

  const TABS = [
    { label: 'Units', Component: UnitsPage },
    { label: 'Categories', Component: CategoriesPage },
    ...(hasInventory
      ? [
          {
            label: 'Locations',
            Component: () => (
              <RequireCapability cap={Capabilities.MANAGE_INVENTORY} inline={false}>
                <LocationsPage />
              </RequireCapability>
            ),
          },
        ]
      : []),
    ...(hasSuppliers
      ? [
          {
            label: 'Suppliers',
            Component: () => (
              <RequireCapability cap={Capabilities.MANAGE_SUPPLIERS} inline={false}>
                <SuppliersPage />
              </RequireCapability>
            ),
          },
        ]
      : []),
    ...(hasCustomers
      ? [
          {
            label: 'Customers',
            Component: () => (
              <RequireCapability cap={Capabilities.MANAGE_CUSTOMERS} inline={false}>
                <CustomersPage />
              </RequireCapability>
            ),
          },
        ]
      : []),
    ...(hasBranches
      ? [
          {
            label: 'Branches',
            Component: () => (
              <RequireCapability cap={Capabilities.MANAGE_BRANCHES} inline={false}>
                <BranchesPage />
              </RequireCapability>
            ),
          },
        ]
      : []),
    { label: 'Capabilities', Component: CapabilitiesPage },
    { label: 'Business Profile', Component: BusinessProfilePage },
    { label: 'Security', Component: SecurityPage },
    { label: 'Account', Component: AccountPage },
  ] as const

  const VALID_TABS: Set<string> = new Set(TABS.map(t => t.label))
  const defaultValue = tab && VALID_TABS.has(tab) ? tab : 'Units'

  return <Tab defaultValue={defaultValue} className='grow h-1' tabClass='px-4' tabs={[...TABS]} />
}
