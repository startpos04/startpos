import type { ReactNode } from 'react'
import { Aside } from '@startpos-core/components/custom/aside'
import MountManager from '@/lib/mount-manager'

export const ORDER_HISTORY_ASIDE_ID = 'order-history-aside'

export const showOrderHistorySidebar = (children: ReactNode, toggle = false) => {
  MountManager.show(Aside, {
    key: ORDER_HISTORY_ASIDE_ID,
    target: ORDER_HISTORY_ASIDE_ID,
    toggle,
    children,
  })
}

export const closeOrderHistorySidebar = () => {
  MountManager.clear(ORDER_HISTORY_ASIDE_ID)
}
