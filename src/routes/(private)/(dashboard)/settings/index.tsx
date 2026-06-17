import { createFileRoute } from '@tanstack/react-router'
import Tab from '@/components/custom/tab'
import { CategoriesPage } from './-categories'
import { CustomersPage } from './-customers'
import { LocationsPage } from './-locations'
import { SuppliersPage } from './-suppliers'
import { UnitsPage } from './-units'

export const Route = createFileRoute('/(private)/(dashboard)/settings/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <Tab
      defaultValue='Units'
      className='grow h-1'
      tabClass='px-4'
      tabs={[
        { label: 'Units', Component: UnitsPage },
        { label: 'Categories', Component: CategoriesPage },
        { label: 'Locations', Component: LocationsPage },
        { label: 'Suppliers', Component: SuppliersPage },
        { label: 'Customers', Component: CustomersPage },
      ]}
    />
  )
}
