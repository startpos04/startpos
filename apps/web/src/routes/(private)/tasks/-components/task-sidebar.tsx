import { Aside } from '@platform/components/custom/aside'
import type { ReactNode } from 'react'
import MountManager from '@/lib/mount-manager'

export const TASK_ASIDE_ID = 'task-aside'

export const showTaskSidebar = (children: ReactNode, toggle = false) => {
  MountManager.show(Aside, {
    key: TASK_ASIDE_ID,
    target: TASK_ASIDE_ID,
    toggle,
    children,
  })
}

export const closeTaskSidebar = () => {
  MountManager.clear(TASK_ASIDE_ID)
}
