import { ImageInput } from '@/components/custom/form/image-input'
import { SelectInput } from '@/components/custom/form/select-input'
import { TextInput } from '@/components/custom/form/text-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useForm } from '@tanstack/react-form'
import { BadgeCheck, Save, UserCircle } from 'lucide-react'
import { ReactNode } from 'react'
import z from 'zod'

interface CreateAccountProps {
  defaultValues: CreateAccountFormData
  onSubmit: ({ value }: { value: CreateAccountFormData }) => Promise<void>
  children: ReactNode
  textBtn: {
    default: string
    isSubmitting: string
  }
}

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.email('Invalid email'),
  image: z.string().optional(),
  role: z.enum(['ADMIN', 'SUPERVISOR', 'CASHIER']),
})

export type CreateAccountFormData = z.infer<typeof schema>

export function CreateAccount({ onSubmit, defaultValues, children, textBtn }: CreateAccountProps) {
  const form = useForm({
    defaultValues,
    onSubmit,
    validators: {
      onChange: schema,
    },
  })

  return (
    <div className='flex flex-col gap-6 max-w-4xl mx-auto'>
      {children}

      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
        {/* Main Profile Info */}
        <div className='md:col-span-2 space-y-6'>
          <Card className='rounded-[2rem] border-none shadow-sm bg-card/50 backdrop-blur-md'>
            <CardHeader>
              <CardTitle className='text-lg flex items-center gap-2'>
                <UserCircle className='w-6 h-6 text-blue-500' /> Personal Details
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
                <BadgeCheck className='w-6 h-6 text-emerald-500' /> Access Control
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
      <div className='pt-4'>
        <form.Subscribe
          selector={state => [state.canSubmit, state.isSubmitting]}
          children={([canSubmit, isSubmitting]) => (
            <Button
              onClick={() => form.handleSubmit()}
              disabled={!canSubmit || isSubmitting}
              className='w-full h-14 rounded-2xl text-lg font-bold shadow-xl active:scale-95 flex gap-2 shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]'
            >
              <Save className='w-5! h-5!' />
              {isSubmitting ? textBtn.isSubmitting : textBtn.default}
            </Button>
          )}
        />
      </div>
    </div>
  )
}
