/**
 * Capability Sidebar Wrapper
 *
 * Manages the aside element that displays capability details.
 */

import MountManager from '@/lib/mount-manager'

export const CAPABILITY_ASIDE_ID = 'capability-details-aside'

export function showCapabilitySidebar(content: React.ReactNode) {
  MountManager.mount(CAPABILITY_ASIDE_ID, content)
}

export function closeCapabilitySidebar() {
  MountManager.unmount(CAPABILITY_ASIDE_ID)
}
