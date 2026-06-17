import type { ComponentPropsWithoutRef, ReactNode } from 'react'

interface FormProps extends ComponentPropsWithoutRef<'form'> {
  onSubmit: () => void | Promise<void>
  children: ReactNode
}

export function Form({ onSubmit, children, ...props }: FormProps) {
  const handleSubmit: ComponentPropsWithoutRef<'form'>['onSubmit'] = e => {
    e.preventDefault()
    e.stopPropagation()

    onSubmit()
  }

  return (
    <form {...props} onSubmit={handleSubmit}>
      {children}
    </form>
  )
}
