import type { AnyFieldApi } from '@tanstack/react-form'
import { Field } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface SelectInputProps<T> {
  label: string
  field: AnyFieldApi
  disabled?: boolean
  options: { value: string; label: string; data?: T }[]
  placeholder?: string
}

export function SelectInput<T>({ label, field, options, placeholder }: SelectInputProps<T>) {
  return (
    <Field>
      <Label>{label}</Label>
      <Select value={field.state.value} onValueChange={val => field.handleChange(val)}>
        <SelectTrigger onBlur={field.handleBlur}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map(opt => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {field.state.meta.errors.length > 0 && <p className='text-xs text-red-500'>{field.state.meta.errors.map(err => err.message ?? err).join(', ')}</p>}
    </Field>
  )
}
