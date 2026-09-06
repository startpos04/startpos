import { Field } from '@platform/components/ui/field'
import { Label } from '@platform/components/ui/label'
import { Textarea } from '@platform/components/ui/textarea'
import type { AnyFieldApi } from '@tanstack/react-form'
import type { InputHTMLAttributes, ReactNode } from 'react'

interface TextAreaInputProps extends React.DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement> {
  label: string | ReactNode
  field: AnyFieldApi
}

export function TextAreaInput({ label, field, placeholder }: TextAreaInputProps) {
  return (
    <Field>
      <Label>{label}</Label>
      <Textarea
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={e => field.handleChange(e.target.value)}
        placeholder={placeholder}
      />
      {field.state.meta.errors.length > 0 && <p className='text-xs text-destructive'>{field.state.meta.errors.map(err => err.message ?? err).join(', ')}</p>}
    </Field>
  )
}
