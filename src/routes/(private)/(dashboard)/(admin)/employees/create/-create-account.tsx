import { useForm } from '@tanstack/react-form'
import { BadgeCheck, Save, UserCircle } from 'lucide-react'
import { Role } from 'prisma/generated/prisma/enums'
import type { ReactNode } from 'react'
import z from 'zod'
import { ImageInput } from '@/components/custom/form/image-input'
import { SelectInput } from '@/components/custom/form/select-input'
import { TextInput } from '@/components/custom/form/text-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { userCollection } from '@/db/collections'

interface CreateAccountProps {
  defaultValues: CreateAccountFormData
  onSubmit: ({ value }: { value: CreateAccountFormData }) => Promise<void>
  children?: ReactNode
  textBtn: {
    default: string
    isSubmitting: string
  }
}

const createAccountSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.email('Invalid email').refine(
    val => {
      const existingUser = [...userCollection.values()].find(u => u.email === val)
      return !existingUser
    },
    { message: 'This email is already in use' },
  ),
  image: z.string().optional(),
  role: z.enum(Role),
})

export type CreateAccountFormData = z.infer<typeof createAccountSchema>

export function CreateAccount({ onSubmit, defaultValues, children, textBtn }: CreateAccountProps) {
  const form = useForm({
    defaultValues,
    onSubmit,
    validators: {
      onChange: createAccountSchema,
    },
  })

  return (
    <div className='flex flex-col h-full'>
      {/* Scrollable form body */}
      <div className='flex-1 overflow-y-auto p-4 space-y-4'>
        {children && <div className='pb-2'>{children}</div>}

        {/* Personal Details */}
        <Card className='rounded-[2rem] border-none shadow-sm bg-card/50 backdrop-blur-md'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base flex items-center gap-2'>
              <UserCircle className='w-4 h-4 text-blue-500' /> Personal Details
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <form.Field name='name' children={field => <TextInput field={field} label='Full Name' placeholder='John Doe' />} />
            <form.Field name='email' children={field => <TextInput field={field} label='Email Address' type='email' placeholder='john@business.com' />} />
            <form.Field name='image' children={field => <ImageInput label='Employee Avatar' field={field} />} />
          </CardContent>
        </Card>

        {/* Access Control */}
        <Card className='rounded-[2rem] border-none shadow-sm bg-card/50 backdrop-blur-md'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base flex items-center gap-2'>
              <BadgeCheck className='w-4 h-4 text-emerald-500' /> Access Control
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
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
            <div className='pt-2 border-t border-dashed'>
              <div className='bg-muted/50 p-3 rounded-2xl'>
                <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1'>Role Info</h4>
                <p className='text-[0.7rem] text-muted-foreground leading-relaxed'>
                  Roles define what sections of the POS and Dashboard this user can access. You can update these later in settings.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sticky footer */}
      <div className='p-4 border-t shrink-0'>
        <form.Subscribe
          selector={state => [state.canSubmit, state.isSubmitting]}
          children={([canSubmit, isSubmitting]) => (
            <Button
              onClick={() => form.handleSubmit()}
              disabled={!canSubmit || isSubmitting}
              className='w-full h-11 rounded-xl font-semibold shadow-lg flex gap-2 shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]'
            >
              <Save className='w-4! h-4!' />
              {isSubmitting ? textBtn.isSubmitting : textBtn.default}
            </Button>
          )}
        />
      </div>
    </div>
  )
}
