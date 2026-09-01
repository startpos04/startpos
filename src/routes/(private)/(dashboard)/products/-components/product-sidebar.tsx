import type { ReactNode } from 'react'
import { Aside } from '@startpos-core/components/custom/aside'
import MountManager from '@/lib/mount-manager'

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
