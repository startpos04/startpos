import { Field } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AnyFieldApi } from '@tanstack/react-form'

interface SelectInputProps {
  label: string
  containerClass?: string
  field: AnyFieldApi
  options: { value: string; label: string }[]
  placeholder?: string
}

export function SelectInput({ label, field, options, placeholder, containerClass }: SelectInputProps) {
  return (
    <Field>
      <div className={containerClass}>
        <Label>{label}</Label>
        <Select value={field.state.value} onValueChange={val => field.handleChange(val as any)}>
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
      </div>

      {field.state.meta.errors.length > 0 && <p className='text-xs text-red-500'>{field.state.meta.errors.map((err: any) => err.message ?? err).join(', ')}</p>}
    </Field>
  )
}
