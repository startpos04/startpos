/**
 * legal-footer.tsx
 *
 * Shared footer rendered on public pages (login, register, forgot-password)
 * and legal pages (/terms, /privacy).
 *
 * Contains:
 *   - Copyright
 *   - Links to Terms of Service and Privacy Policy
 */

import { Link } from '@tanstack/react-router'
import { APP_NAME } from '@/lib/constants'

export function LegalFooter() {
  return (
    <footer className='py-1 px-2'>
      <div className='w-full flex flex-col sm:flex-row items-center justify-between gap-1 text-[10px] text-muted-foreground'>
        <p>
          © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
        </p>
        <div className='flex items-center gap-4'>
          <Link to='/terms' className='hover:underline underline-offset-4'>
            Terms of Service
          </Link>
          <Link to='/privacy' className='hover:underline underline-offset-4'>
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  )
}
