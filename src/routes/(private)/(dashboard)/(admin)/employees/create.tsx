import Form from '@/components/custom/form'
import { SelectInput } from '@/components/custom/form/select-input'
import { TextInput } from '@/components/custom/form/text-input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { FieldGroup } from '@/components/ui/field'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import z from 'zod'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.email('Invalid email'),
  image: z.string().optional(),
  role: z.enum(['ADMIN', 'SUPERVISOR', 'CASHIER', 'SERVICE_PROVIDER']),
})

type FormData = z.infer<typeof schema>

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/employees/create')({
  component: () => <RouteComponent />,
})

export function CreateEmployeeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-sm'>
        <RouteComponent onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

function RouteComponent({ onClose }: { onClose?: () => void }) {
  const queryClient = useQueryClient()

  const handleSubmit = async ({ value }: { value: FormData }) => {
    try {
      await crudAPI({
        data: {
          action: 'create',
          table: 'user',
          args: {
            data: {
              ...value,
              image: value.image || null,
              emailVerified: false,
            },
          },
        },
      })

      await queryClient.invalidateQueries({ queryKey: ['employees'] })
      onClose?.()
    } catch (error) {
      console.error('Failed to create employee:', error)
    }
  }

  return <CreateEmployeeContent onClose={onClose} onSubmit={handleSubmit} defaultValues={{ name: '', email: '', image: '', role: 'CASHIER' }} />
}

interface ContentProps {
  onClose?: () => void
  onSubmit: (params: { value: FormData }) => Promise<void>
  defaultValues: FormData
}

export function CreateEmployeeContent({ onClose, onSubmit, defaultValues }: ContentProps) {
  const form = useForm({
    defaultValues,
    onSubmit,
    validators: {
      onBlur: schema,
      onSubmit: schema,
    },
  })

  return (
    <>
      <div data-slot='dialog-header' className='flex flex-col gap-1'>
        <div data-slot='dialog-title' className='text-sm font-medium'>
          Add Employee
        </div>
        <div
          data-slot='dialog-description'
          className='text-xs/relaxed text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground'
        >
          Create a new staff account.
        </div>
      </div>

      <Form onSubmit={form.handleSubmit}>
        <FieldGroup>
          <form.Field name='name' children={field => <TextInput field={field} label='Name' />} />
          <form.Field name='email' children={field => <TextInput field={field} label='Email' type='email' />} />
          <form.Field name='image' children={field => <TextInput field={field} label='Avatar URL' placeholder='https://...' />} />
          <form.Field
            name='role'
            children={field => (
              <SelectInput
                field={field}
                label='Role'
                options={[
                  { value: 'ADMIN', label: 'Admin' },
                  { value: 'SUPERVISOR', label: 'Supervisor' },
                  { value: 'CASHIER', label: 'Cashier' },
                  { value: 'SERVICE_PROVIDER', label: 'Service Provider' },
                ]}
              />
            )}
          />
        </FieldGroup>

        <div data-slot='dialog-footer' className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end mt-4 cursor-pointer'>
          {onClose ? <Button type='button' variant='outline' onClick={onClose} children='Cancel' /> : null}
          <form.Subscribe
            selector={s => [s.canSubmit, s.isSubmitting]}
            children={([canSubmit, isSubmitting]) => (
              <Button type='submit' disabled={!canSubmit}>
                {isSubmitting ? 'Creating...' : 'Create'}
              </Button>
            )}
          />
        </div>
      </Form>
    </>
  )
}
