import { type ReactNode, useEffect, useState } from 'react'
import Loading from './loading'

export function AppWrapper({ children }: { children: ReactNode }) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) return <Loading className='w-screen h-screen' />

  return children
}
