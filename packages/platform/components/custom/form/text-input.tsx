import type { AnyFieldApi } from '@tanstack/react-form'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { Field } from '@platform/components/ui/field'
import { Input } from '@platform/components/ui/input'
import { Label } from '@platform/components/ui/label'

interface TextInputProps extends React.DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement> {
  label?: string | ReactNode
  field: AnyFieldApi
  'data-testid'?: string
}

export function TextInput({ label, field, placeholder, type = 'text', 'data-testid': dataTestId, ...rest }: TextInputProps) {
  return (
    <Field>
      <Label className='empty:hidden'>{label}</Label>
      <Input
        type={type}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={e => field.handleChange(type === 'number' ? +e.target.value || '' : e.target.value)}
        placeholder={placeholder}
        data-testid={dataTestId}
        {...rest}
      />
      {field.state.meta.errors.length > 0 && <p className='text-xs text-destructive'>{field.state.meta.errors.map(err => err.message ?? err).join(', ')}</p>}
    </Field>
  )
}
