import { Aside } from '@platform/components/custom/aside'
import type { ReactNode } from 'react'
import MountManager from '@/lib/mount-manager'

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
