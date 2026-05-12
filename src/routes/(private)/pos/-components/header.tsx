import { ThemeToggle } from '@/components/custom/theme/theme-toggle'
import { ProfileDropdown } from '../../orders/-components/profile-dropdown'
import { SearchInput } from '../../orders/-components/search-input'
import Title from '../../orders/-components/title'
import { ActiveOrdersButton } from './active-orders-btn'

export const PosHeader = () => (
  <header className='flex justify-between items-center bg-card/80 backdrop-blur-md p-4 rounded-[2.5rem] border border-border'>
    <Title />
    <SearchInput />
    <div className='flex items-center gap-1'>
      <div className='w-10 ml-5'>
        <ThemeToggle />
      </div>
      <ActiveOrdersButton />
      <ProfileDropdown />
    </div>
  </header>
)
