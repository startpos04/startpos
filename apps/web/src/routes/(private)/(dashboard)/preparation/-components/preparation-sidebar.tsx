import { Aside } from '@platform/components/custom/aside'
import type { ReactNode } from 'react'
import MountManager from '@/lib/mount-manager'

export const PREPARATION_ASIDE_ID = 'preparation-aside'

export const showPreparationSidebar = (children: ReactNode, toggle = false) => {
  MountManager.show(Aside, {
    key: PREPARATION_ASIDE_ID,
    target: PREPARATION_ASIDE_ID,
    toggle,
    children,
  })
}

export const closePreparationSidebar = () => {
  MountManager.clear(PREPARATION_ASIDE_ID)
}
