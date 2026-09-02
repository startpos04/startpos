import { Aside } from '@platform/components/custom/aside'
import type { ReactNode } from 'react'
import MountManager from '@/lib/mount-manager'

export const PURCHASE_ASIDE_ID = 'purchase-aside'

export const showPurchaseSidebar = (children: ReactNode, toggle = false) => {
  MountManager.show(Aside, {
    key: PURCHASE_ASIDE_ID,
    target: PURCHASE_ASIDE_ID,
    toggle,
    children,
  })
}

export const closePurchaseSidebar = () => {
  MountManager.clear(PURCHASE_ASIDE_ID)
}
