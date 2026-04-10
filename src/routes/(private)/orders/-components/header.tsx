import { ThemeToggle } from '@/components/custom/theme/theme-toggle'
import { PosButton } from './pos-button'
import { ProfileDropdown } from './profile-dropdown'
import Title from './title'

export const ActiveOrdersHeader = function () {
  return (
    <header className='flex justify-between items-center bg-card/80 backdrop-blur-md p-4 rounded-[2.5rem] border border-border mx-4'>
      <Title />

      <div className='flex items-center gap-3'>
        <div className='w-10'>
          <ThemeToggle />
        </div>

        <PosButton />

        <ProfileDropdown />
      </div>
    </header>
  )
}
