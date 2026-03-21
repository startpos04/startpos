import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import z from 'zod'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  image: z.string().optional(),
  role: z.enum(['ADMIN', 'SUPERVISOR', 'CASHIER', 'SERVICE_PROVIDER']),
})

type FormData = z.infer<typeof schema>

export function CreateEmployeeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()

  const form = useForm({
    defaultValues: {
      name: '',
      email: '',
      image: '',
      role: 'CASHIER',
    } as FormData,
    validators: {
      onBlur: schema,
      onSubmit: schema,
    },
    onSubmit: async ({ value }) => {
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
      onClose()
    },
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader>
          <DialogTitle>Add Employee</DialogTitle>
          <DialogDescription>Create a new staff account.</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={e => {
            e.preventDefault()
            form.handleSubmit()
          }}
        >
          <FieldGroup>
            {/* NAME */}
            <form.Field name='name' validators={{ onChange: schema.shape.name }}>
              {field => (
                <Field>
                  <Label>Name</Label>
                  <Input value={field.state.value} onChange={e => field.handleChange(e.target.value)} />
                  {field.state.meta.errors.length > 0 && (
                    <p className='text-xs text-red-500'>{field.state.meta.errors.map(err => (err as any).message ?? err).join(', ')}</p>
                  )}
                </Field>
              )}
            </form.Field>

            {/* EMAIL */}
            <form.Field name='email' validators={{ onChange: schema.shape.email }}>
              {field => (
                <Field>
                  <Label>Email</Label>
                  <Input type='email' value={field.state.value} onChange={e => field.handleChange(e.target.value)} />
                  {field.state.meta.errors.length > 0 && (
                    <p className='text-xs text-red-500'>{field.state.meta.errors.map(err => (err as any).message ?? err).join(', ')}</p>
                  )}
                </Field>
              )}
            </form.Field>

            {/* IMAGE */}
            <form.Field name='image'>
              {field => (
                <Field>
                  <Label>Avatar URL</Label>
                  <Input value={field.state.value} onChange={e => field.handleChange(e.target.value)} placeholder='https://...' />
                </Field>
              )}
            </form.Field>

            {/* ROLE */}
            <form.Field name='role'>
              {field => (
                <Field>
                  <Label>Role</Label>
                  <Select value={field.state.value} onValueChange={val => field.handleChange(val as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='ADMIN'>Admin</SelectItem>
                      <SelectItem value='SUPERVISOR'>Supervisor</SelectItem>
                      <SelectItem value='CASHIER'>Cashier</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </form.Field>
          </FieldGroup>

          <DialogFooter className='mt-4'>
            <Button type='button' variant='outline' onClick={onClose}>
              Cancel
            </Button>

            <form.Subscribe selector={s => [s.canSubmit, s.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <Button type='submit' disabled={!canSubmit}>
                  {isSubmitting ? 'Creating...' : 'Create'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
