import { Aside } from '@platform/components/custom/aside'
import type { ReactNode } from 'react'
import MountManager from '@/lib/mount-manager'

export const PERMISSION_ASIDE_ID = 'permission-aside'

export const showPermissionSidebar = (children: ReactNode, toggle = false) => {
  MountManager.show(Aside, {
    key: PERMISSION_ASIDE_ID,
    target: PERMISSION_ASIDE_ID,
    toggle,
    children,
  })
}

export const closePermissionSidebar = () => {
  MountManager.clear(PERMISSION_ASIDE_ID)
}
