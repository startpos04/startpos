import { Aside } from '@platform/components/custom/aside'
import type { ReactNode } from 'react'
import MountManager from '@platform/lib/mount-manager'

export const UNIT_ASIDE_ID = 'unit-aside'

export const showUnitSidebar = (children: ReactNode, toggle = false) => {
  MountManager.show(Aside, {
    key: UNIT_ASIDE_ID,
    target: UNIT_ASIDE_ID,
    toggle,
    children,
  })
}

export const closeUnitSidebar = () => {
  MountManager.clear(UNIT_ASIDE_ID)
}
