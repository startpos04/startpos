import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { refreshAuthUser } from '@/store/auth-store'

export function useBranchSwitch() {
  const navigate = useNavigate()

  const switchBranch = async (branchId: string) => {
    try {
      // TODO: Create server function to update user's active branch in database
      // This will be implemented in a later phase when we add the backend logic
      // await updateUserActiveBranch({ branchId })

      // For now, we'll just show a placeholder message
      toast.info('Branch switching will be implemented when backend support is added')

      // Refresh auth store to load new branch context
      await refreshAuthUser()

      // Navigate to dashboard
      navigate({ to: '/dashboard' })

      // Force full page reload to ensure all branch-specific data is refreshed
      // This ensures all queries and state are reset with the new branch context
      setTimeout(() => window.location.reload(), 100)
    } catch (error) {
      console.error('Failed to switch branch:', error)
      toast.error('Failed to switch branch. Please try again.')
    }
  }

  return { switchBranch }
}
