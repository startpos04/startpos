import { Aside } from '@platform/components/custom/aside'
import MountManager from '@platform/lib/mount-manager'
import type { ReactNode } from 'react'

export const BRANCH_ASIDE_ID = 'branch-aside'

export const showBranchSidebar = (children: ReactNode, toggle = false) => {
  MountManager.show(Aside, {
    key: BRANCH_ASIDE_ID,
    target: BRANCH_ASIDE_ID,
    toggle,
    children,
  })
}

export const closeBranchSidebar = () => {
  MountManager.clear(BRANCH_ASIDE_ID)
}
