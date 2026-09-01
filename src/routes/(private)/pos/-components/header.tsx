import { useStore } from '@tanstack/react-store'
import { ThemeToggle } from '@/components/custom/theme/theme-toggle'
import { useCapability } from '@/hooks/use-capability'
import { Capabilities } from '@/lib/entitlement/capability-keys'
import { authStore } from '@/lib/better-auth/auth-store'
import { ProfileDropdown } from '../../orders/-components/profile-dropdown'
import { SearchInput } from '../../orders/-components/search-input'
import Title from '../../orders/-components/title'
import { ActiveOrdersButton } from './active-orders-btn'
import { BluetoothPrinterControl } from './bluetooth-printer-control'

export const PosHeader = () => {
  const user = useStore(authStore, state => state.user)
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
