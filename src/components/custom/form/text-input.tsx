import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AnyFieldApi } from '@tanstack/react-form'
import { InputHTMLAttributes, ReactNode } from 'react'

interface TextInputProps extends React.DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement> {
  label: string | ReactNode
  field: AnyFieldApi
}

export function TextInput({ label, field, placeholder, type = 'text' }: TextInputProps) {
  return (
    <Field>
      <Label>{label}</Label>
      <Input
        type={type}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={e => field.handleChange(type === 'number' ? +e.target.value || '' : e.target.value)}
        placeholder={placeholder}
      />
      {field.state.meta.errors.length > 0 && <p className='text-xs text-red-500'>{field.state.meta.errors.map((err: any) => err.message ?? err).join(', ')}</p>}
    </Field>
  )
}
