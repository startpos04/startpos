import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/better-auth/auth-client'
import { useNavigate } from '@tanstack/react-router'

export function LogoutButton() {
  const navigate = useNavigate()

  const handleLogout = () => {
    authClient.signOut(
      {},
      {
        onSuccess: () => {
          navigate({ to: '/', reloadDocument: true })
        },
      },
    )
  }

  return (
    <Button variant='outline' size='sm' onClick={handleLogout}>
      Logout
    </Button>
  )
}
