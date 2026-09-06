import { Field } from '@platform/components/ui/field'
import type { AnyFieldApi } from '@tanstack/react-form'
import { ImageUploader } from '../image-uploader'

interface ImageInputProps {
  label: string
  field: AnyFieldApi
}

export function ImageInput({ label, field }: ImageInputProps) {
  return (
    <Field>
      <ImageUploader label={label} value={field.state.value} onChange={val => field.handleChange(val)} />
      {field.state.meta.errors.length > 0 && <p className='text-xs text-red-500'>{field.state.meta.errors.map(err => err.message ?? err).join(', ')}</p>}
    </Field>
  )
}
