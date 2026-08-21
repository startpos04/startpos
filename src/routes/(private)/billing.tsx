import { createFileRoute, redirect } from '@tanstack/react-router'

// Redirect old /billing route to /business/billing
export const Route = createFileRoute('/(private)/billing')({
  beforeLoad: async () => {
    throw redirect({ to: '/business/billing' })
  },
})
