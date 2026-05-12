import { ThemeToggle } from '@/components/custom/theme/theme-toggle'
import { PosButton } from './pos-button'
import { ProfileDropdown } from './profile-dropdown'
import Title from './title'

export const ActiveOrdersHeader = () => (
  <header className='flex justify-between items-center bg-card/80 backdrop-blur-md p-4 rounded-[2.5rem] border border-border mx-4'>
    <Title />

    <div className='flex items-center justify-end gap-1 w-36'>
      <ThemeToggle />
      <PosButton />
      <ProfileDropdown />
    </div>
  </header>
)
