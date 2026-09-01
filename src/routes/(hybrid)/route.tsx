import { createFileRoute, Outlet } from '@tanstack/react-router'

// (hybrid) — routes accessible both authenticated and unauthenticated.
// No auth gate, no layout wrapper — just a passthrough.
export const Route = createFileRoute('/(hybrid)')({
  component: () => <Outlet />,
})
