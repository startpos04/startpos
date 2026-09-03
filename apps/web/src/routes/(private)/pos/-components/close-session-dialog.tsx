import Tab from '@platform/components/custom/tab'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@platform/components/ui/dialog'
import { useCapability } from '@platform/hooks/use-capability'
import { Capabilities } from '@platform/lib/entitlement/capability-keys'
import type { MountProps } from '@platform/lib/mount-manager'
import { ReconcileLater } from './reconcile-later'
import { ReconcileNow } from './reconcile-now'

export function CloseSessionDialog({ open, onClose }: MountProps) {
  const canCreateTask = useCapability(Capabilities.CREATE_TASK)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className='sm:max-w-lg p-0 pt-6 pb-1 space-y-2 bg-background rounded-[2rem] border-none shadow-2xl'
        onEscapeKeyDown={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
      >
        <DialogHeader className='px-4'>
          <DialogTitle className='text-3xl font-bold tracking-tight'>End Shift</DialogTitle>
          <DialogDescription className='text-base'>Count the cash in your drawer and enter the total below.</DialogDescription>
        </DialogHeader>

        <Tab
          containerClass='px-4'
          tabClass='px-4'
          tabs={[
            canCreateTask ? { label: 'Create a Task', Component: ReconcileLater, onClose } : null,
            { label: 'Reconcile Now', Component: ReconcileNow, onClose },
          ].filter((tab): tab is NonNullable<typeof tab> => !!tab)}
        />
      </DialogContent>
    </Dialog>
  )
}
