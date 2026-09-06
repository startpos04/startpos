import { Aside } from '@platform/components/custom/aside'
import MountManager from '@platform/lib/mount-manager'
import type { ReactNode } from 'react'

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
