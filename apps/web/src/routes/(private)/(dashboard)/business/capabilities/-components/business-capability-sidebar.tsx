/**
 * Business Capability Sidebar Wrapper
 *
 * Manages the aside element that displays business capability details.
 */

import { Aside } from '@platform/components/custom/aside'
import MountManager from '@platform/lib/mount-manager'
import type { ReactNode } from 'react'

export const BUSINESS_CAPABILITY_ASIDE_ID = 'business-capability-aside'

export function showBusinessCapabilitySidebar(children: ReactNode, toggle = false) {
  MountManager.show(Aside, {
    key: BUSINESS_CAPABILITY_ASIDE_ID,
    target: BUSINESS_CAPABILITY_ASIDE_ID,
    toggle,
    children,
  })
}

export function closeBusinessCapabilitySidebar() {
  MountManager.clear(BUSINESS_CAPABILITY_ASIDE_ID)
}
