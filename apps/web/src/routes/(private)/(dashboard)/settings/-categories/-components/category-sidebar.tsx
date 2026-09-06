import { Aside } from '@platform/components/custom/aside'
import MountManager from '@platform/lib/mount-manager'
import type { ReactNode } from 'react'

export const CATEGORY_ASIDE_ID = 'category-aside'

export const showCategorySidebar = (children: ReactNode, toggle = false) => {
  MountManager.show(Aside, {
    key: CATEGORY_ASIDE_ID,
    target: CATEGORY_ASIDE_ID,
    toggle,
    children,
  })
}

export const closeCategorySidebar = () => {
  MountManager.clear(CATEGORY_ASIDE_ID)
}
