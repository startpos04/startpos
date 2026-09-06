/**
 * Capability Sidebar Wrapper
 *
 * Manages the aside element that displays entitlement capability details.
 */

import { Aside } from '@platform/components/custom/aside'
import MountManager from '@platform/lib/mount-manager'
import type { ReactNode } from 'react'

export const CAPABILITY_ASIDE_ID = 'capability-aside'

export function showCapabilitySidebar(children: ReactNode, toggle = false) {
  MountManager.show(Aside, {
    key: CAPABILITY_ASIDE_ID,
    target: CAPABILITY_ASIDE_ID,
    toggle,
    children,
  })
}

export function closeCapabilitySidebar() {
  MountManager.clear(CAPABILITY_ASIDE_ID)
}
