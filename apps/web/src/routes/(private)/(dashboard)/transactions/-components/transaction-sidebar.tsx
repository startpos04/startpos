import { Aside } from '@platform/components/custom/aside'
import type { ReactNode } from 'react'
import MountManager from '@platform/lib/mount-manager'

export const TRANSACTION_ASIDE_ID = 'transaction-aside'

export const showTransactionSidebar = (children: ReactNode, toggle = false) => {
  MountManager.show(Aside, {
    key: TRANSACTION_ASIDE_ID,
    target: TRANSACTION_ASIDE_ID,
    toggle,
    children,
  })
}

export const closeTransactionSidebar = () => {
  MountManager.clear(TRANSACTION_ASIDE_ID)
}
