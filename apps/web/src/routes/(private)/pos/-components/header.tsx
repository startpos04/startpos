import { ThemeToggle } from '@platform/components/custom/theme/theme-toggle'
import { useCapability } from '@platform/hooks/use-capability'
import { Capabilities } from '@platform/lib/entitlement/capability-keys'
import { ProfileDropdown } from '../../orders/-components/profile-dropdown'
import { SearchInput } from '../../orders/-components/search-input'
import Title from '../../orders/-components/title'
import { ActiveOrdersButton } from './active-orders-btn'
import { BluetoothPrinterControl } from './bluetooth-printer-control'

export const PosHeader = () => {
  const canCreateOrder = useCapability(Capabilities.CREATE_ORDER)

  return (
    <header className='flex justify-between items-center bg-card/80 backdrop-blur-md p-4 rounded-4xl border border-border'>
      <Title />
      <SearchInput />
      <div className='flex items-center gap-1'>
        <BluetoothPrinterControl />
        <div className='w-10 ml-5'>
          <ThemeToggle />
        </div>
        {canCreateOrder ? <ActiveOrdersButton /> : null}
        <ProfileDropdown />
      </div>
    </header>
  )
}
