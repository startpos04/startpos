import { Aside } from '@platform/components/custom/aside'
import type { ReactNode } from 'react'
import MountManager from '@platform/lib/mount-manager'

export const PRODUCT_ASIDE_ID = 'product-aside'

export const showProductSidebar = (children: ReactNode, toggle = false) => {
  MountManager.show(Aside, {
    key: PRODUCT_ASIDE_ID,
    target: PRODUCT_ASIDE_ID,
    toggle,
    children,
  })
}

export const closeProductSidebar = () => {
  MountManager.clear(PRODUCT_ASIDE_ID)
}
