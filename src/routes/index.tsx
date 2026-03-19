import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    const { user } = context
    if (user) {
      throw redirect({ to: user.landingPage })
    }
  },
})
