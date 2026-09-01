import type { ReactNode } from 'react'
import { Aside } from '@startpos-core/components/custom/aside'
import MountManager from '@/lib/mount-manager'

export const EMPLOYEE_ASIDE_ID = 'employee-aside'

export const showEmployeeSidebar = (children: ReactNode, toggle = false) => {
  MountManager.show(Aside, {
    key: EMPLOYEE_ASIDE_ID,
    target: EMPLOYEE_ASIDE_ID,
    toggle,
    children,
  })
}

export const closeEmployeeSidebar = () => {
  MountManager.clear(EMPLOYEE_ASIDE_ID)
}
