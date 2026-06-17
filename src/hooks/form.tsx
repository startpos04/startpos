import { createFormHook } from '@tanstack/react-form'
import { TextInput } from '@/components/custom/form/text-input.tsx'
import { fieldContext, formContext, useFormContext } from './form-context'

function SubscribeButton({ label }: { label: string }) {
  const form = useFormContext()
  return (
    <form.Subscribe selector={state => state.isSubmitting}>
      {isSubmitting => (
        <button type='button' disabled={isSubmitting}>
          {label}
        </button>
      )}
    </form.Subscribe>
  )
}

export const { useAppForm, withForm } = createFormHook({
  fieldComponents: {
    TextInput,
  },
  formComponents: {
    SubscribeButton,
  },
  fieldContext,
  formContext,
})
