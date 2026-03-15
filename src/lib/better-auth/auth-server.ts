import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from './auth-middleware'

export const getUserId = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return context?.user?.id
  })
