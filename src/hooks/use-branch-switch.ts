import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { updateActiveBranch } from '@/lib/server-fn/update-active-branch'
import { refreshAuthUser } from '@/lib/better-auth/auth-store'

export function useBranchSwitch() {
  const navigate = useNavigate()

  const switchBranch = async (branchId: string) => {
    try {
      // Update user's active branch in database
      const result = await updateActiveBranch({ data: { branchId } })

      if (!result.success) {
        toast.error('Failed to switch branch', {
          description: result.error || 'Unknown error occurred',
        })
        return
      }

      // Show success message
      toast.success('Branch switched', {
        description: `Switched to ${result.branchName}`,
      })

      // Refresh auth store to load new branch context
      await refreshAuthUser()

      // Navigate to dashboard
      navigate({ to: '/dashboard' })

      // Force full page reload to ensure all branch-specific data is refreshed
      // This ensures all queries and state are reset with the new branch context
      setTimeout(() => window.location.reload(), 100)
    } catch (error) {
      console.error('Failed to switch branch:', error)
      toast.error('Failed to switch branch', {
        description: error instanceof Error ? error.message : 'Please try again',
      })
    }
  }

  return { switchBranch }
}
