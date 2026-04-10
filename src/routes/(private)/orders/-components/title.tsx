import { APP_NAME } from '@/lib/constants'
import dayjs from '@/lib/dayjs'

function Title() {
  return (
    <div className='hidden lg:block px-4 border-r border-border mr-4'>
      <h1 className='text-xl font-black tracking-tighter'>{APP_NAME}</h1>
      <p className='text-muted-foreground text-[10px] font-bold uppercase tracking-widest'>{dayjs().format('ddd, MMM DD · HH:mm')}</p>
    </div>
  )
}

export default Title
