import { ImageInput } from '@/components/custom/form/image-input'
import { SelectInput } from '@/components/custom/form/select-input'
import { TextInput } from '@/components/custom/form/text-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { BadgeCheck, Save, UserCircle } from 'lucide-react'
import z from 'zod'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.email('Invalid email'),
  image: z.string().optional(),
  role: z.enum(['ADMIN', 'SUPERVISOR', 'CASHIER']),
})

type FormData = z.infer<typeof schema>

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/employees/create')({
  component: () => <RouteComponent />,
})

export function CreateEmployeeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-4xl max-h-[90vh] overflow-y-auto'>
        <RouteComponent onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

function RouteComponent({ onClose }: { onClose?: () => void }) {
  const queryClient = useQueryClient()
  const navigate = Route.useNavigate()

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
      onClose?.() || navigate({ to: '..' })
    } catch (error) {
      console.error('Failed to create employee:', error)
    }
  }

  const form = useForm({
    defaultValues: { name: '', email: '', image: '', role: 'CASHIER' },
    onSubmit: handleSubmit,
    validators: {
      onBlur: schema,
      onSubmit: schema,
    },
  })

  return (
    <div className='flex flex-col gap-6 max-w-4xl mx-auto'>
      {/* Header */}
      <div>
        <h1 className='text-3xl font-bold tracking-tight'>Add Employee</h1>
        <p className='text-muted-foreground text-sm'>Create a new staff account and assign permissions.</p>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
        {/* Main Profile Info */}
        <div className='md:col-span-2 space-y-6'>
          <Card className='rounded-[2rem] border-none shadow-sm bg-card/50 backdrop-blur-md'>
            <CardHeader>
              <CardTitle className='text-lg flex items-center gap-2'>
                <UserCircle className='w-5 h-5 text-blue-500' /> Personal Details
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <form.Field name='name' children={field => <TextInput field={field} label='Full Name' placeholder='John Doe' />} />
              <form.Field name='email' children={field => <TextInput field={field} label='Email Address' type='email' placeholder='john@business.com' />} />
              <form.Field name='image' children={field => <ImageInput label='Employee Avatar' field={field} />} />
            </CardContent>
          </Card>
        </div>

        {/* Role & Permissions */}
        <div className='space-y-6'>
          <Card className='rounded-[2rem] border-none shadow-sm bg-card/50 backdrop-blur-md'>
            <CardHeader>
              <CardTitle className='text-lg flex items-center gap-2'>
                <BadgeCheck className='w-5 h-5 text-emerald-500' /> Access Control
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-6'>
              <form.Field
                name='role'
                children={field => (
                  <SelectInput
                    field={field}
                    label='Job Role'
                    options={[
                      { value: 'ADMIN', label: 'Admin (Full Access)' },
                      { value: 'SUPERVISOR', label: 'Supervisor' },
                      { value: 'CASHIER', label: 'Cashier' },
                    ]}
                  />
                )}
              />

              <div className='pt-4 border-t border-dashed'>
                <div className='bg-muted/50 p-4 rounded-2xl'>
                  <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2'>Role Info</h4>
                  <p className='text-[0.7rem] text-muted-foreground leading-relaxed'>
                    Roles define what sections of the POS and Dashboard this user can access. You can update these later in settings.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <form.Subscribe
        selector={state => [state.canSubmit, state.isSubmitting]}
        children={([canSubmit, isSubmitting]) => (
          <Button onClick={() => form.handleSubmit()} disabled={!canSubmit} className='px-8 shadow-lg shadow-primary/20'>
            {isSubmitting ? (
              'Creating...'
            ) : (
              <>
                <Save className='w-4 h-4 mr-2' /> Save Employee
              </>
            )}
          </Button>
        )}
      />
    </div>
  )
}
