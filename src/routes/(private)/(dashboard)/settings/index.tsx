import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import Tab from '@/components/custom/tab'
import { RequireCapability } from '@/components/require-capability'
import { useCapability } from '@/hooks/use-capability'
import { Capabilities } from '@/lib/entitlement/capability-keys'
import { CategoriesPage } from './-categories'
import { CompliancePage } from './-compliance'
import { EntitlementsPage } from './-entitlements'
import { LocationsPage } from './-locations'
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

  const TABS = [
    // Branch-level settings
    { label: 'Entitlements', Component: EntitlementsPage },
    { label: 'Compliance', Component: CompliancePage },
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
    // Note: Business-level settings (Suppliers, Customers, Branches, Capabilities, Business Profile)
    // have been moved to /business section and are now accessible via the context switcher
    // Note: User-level settings (Account, Security) have been moved to /account section
    // and are now accessible via the profile dropdown → "My Account"
  ] as const

  const VALID_TABS: Set<string> = new Set(TABS.map(t => t.label))
  const defaultValue = tab && VALID_TABS.has(tab) ? tab : 'Entitlements'

  return <Tab defaultValue={defaultValue} className='grow h-1' tabClass='px-4' tabs={[...TABS]} />
}
