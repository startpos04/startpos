import { ThemeToggle } from '@/components/custom/theme/theme-toggle'
import { ActiveOrdersButton } from '../../orders/-components/active-orders-btn'
import { ProfileDropdown } from '../../orders/-components/profile-dropdown'
import { SearchInput } from '../../orders/-components/search-input'
import Title from '../../orders/-components/title'

export const PosHeader = function () {
  return (
    <header className='flex justify-between items-center bg-card/80 backdrop-blur-md p-4 rounded-[2.5rem] border border-border mx-4'>
      <Title />
      <SearchInput />
      <div className='flex items-center gap-3'>
        <div className='w-10'>
          <ThemeToggle />
        </div>
        <ActiveOrdersButton />
        <ProfileDropdown />
      </div>
    </header>
  )
}
