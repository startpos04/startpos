import { Aside } from '@platform/components/custom/aside'
import type { ReactNode } from 'react'
import MountManager from '@/lib/mount-manager'

export const AUDIT_ASIDE_ID = 'audit-aside'

export const showAuditSidebar = (children: ReactNode, toggle = false) => {
  MountManager.show(Aside, {
    key: AUDIT_ASIDE_ID,
    target: AUDIT_ASIDE_ID,
    toggle,
    children,
  })
}

export const closeAuditSidebar = () => {
  MountManager.clear(AUDIT_ASIDE_ID)
}
