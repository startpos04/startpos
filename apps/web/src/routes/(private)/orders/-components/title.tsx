import { APP_NAME } from '@platform/lib/constants'
import dayjs from '@platform/lib/dayjs'
import { useEffect, useState } from 'react'

function Title() {
  const [now, setNow] = useState(dayjs())

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(dayjs())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  return (
    <div className='hidden lg:block px-4 border-r border-border mr-4'>
      <h1 className='text-xl font-black tracking-tighter'>{APP_NAME}</h1>
      <p className='text-muted-foreground text-[10px] font-bold uppercase tracking-widest'>{now.format('ddd, MMM DD · hh:mm:ss A')}</p>
    </div>
  )
}

export default Title
