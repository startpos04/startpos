import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AnyFieldApi } from '@tanstack/react-form'
import { InputHTMLAttributes, ReactNode } from 'react'

interface MoneyInputProps extends React.DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement> {
  label: string | ReactNode
  field: AnyFieldApi
}

export function MoneyInput({ label, field, placeholder }: MoneyInputProps) {
  return (
    <Field>
      <Label>{label}</Label>
      <Input
        type='number'
        name={field.name}
        value={field.state.value / 100 || ''}
        onBlur={field.handleBlur}
        onChange={e => {
          const val = parseFloat(e.target.value)
          field.handleChange(isNaN(val) ? 0 : Math.round(val * 100))
        }}
        placeholder={placeholder}
      />
      {field.state.meta.errors.length > 0 && <p className='text-xs text-red-500'>{field.state.meta.errors.map((err: any) => err.message ?? err).join(', ')}</p>}
    </Field>
  )
}
