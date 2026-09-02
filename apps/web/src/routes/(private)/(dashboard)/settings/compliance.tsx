import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * Redirect route for /settings/compliance → /settings?tab=Compliance
 *
 * This allows the registration status indicator and cards to link directly
 * to the compliance settings page.
 */
export const Route = createFileRoute('/(private)/(dashboard)/settings/compliance')({
  beforeLoad: () => {
    throw redirect({
      to: '/settings',
      search: { tab: 'Compliance' },
    })
  },
})
