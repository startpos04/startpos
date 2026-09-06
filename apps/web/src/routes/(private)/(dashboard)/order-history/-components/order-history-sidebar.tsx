import { Aside } from '@platform/components/custom/aside'
import MountManager from '@platform/lib/mount-manager'
import type { ReactNode } from 'react'

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
