import type { ReactNode } from 'react'
import { Aside } from '@/components/custom/aside'
import MountManager from '@/lib/mount-manager'

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
