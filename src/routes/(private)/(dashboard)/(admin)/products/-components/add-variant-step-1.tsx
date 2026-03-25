import { TextInput } from '@/components/custom/form/text-input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useStore } from '@tanstack/react-form'
import { ArrowRight, Info, Plus, Trash2, X } from 'lucide-react'
import { useRef } from 'react'

// ... props interface remains the same

export function DefineVariantsStep({ form, tempInputs, setTempInputs, canPreview }: DefineVariantsStepProps) {
  const attributes = useStore(form.store, (s: any) => s.values.attributes)
  const lastInputRef = useRef<HTMLInputElement>(null)

  const combinationCount = attributes.reduce(
    (acc: number, attr: any) => {
      const validValues = attr.values?.length || 0
      return validValues > 0 ? acc * validValues : acc
    },
    attributes.some((a: any) => a.values?.length > 0) ? 1 : 0,
  )

  const handleAddValue = (index: number, valuesField: any) => {
    const val = tempInputs[index]?.trim()
    if (!val) return

    const exists = valuesField.state.value.some((v: any) => v.variantValue.toLowerCase() === val.toLowerCase())

    if (!exists) {
      // Ensure we push a clean new array to trigger TanStack's reactivity
      valuesField.handleChange([...valuesField.state.value, { variantValue: val, price: 0 }])
      setTempInputs({ ...tempInputs, [index]: '' })
    }
  }

  return (
    <div className='flex flex-col gap-6 overflow-hidden'>
      <div className='bg-blue-500/10 p-3 rounded-md flex gap-2 items-start border border-blue-500/20'>
        <Info className='w-4 h-4 text-blue-500 mt-0.5' />
        <p className='text-[11px] text-blue-600 dark:text-blue-400'>
          Define types (e.g. <b>Color</b>) and add options. Hit <b>Add</b> or <b>Enter</b> to save.
        </p>
      </div>

      <ScrollArea className='flex-1 pr-4'>
        <form.Field name='attributes' mode='array'>
          {(arrayField: any) => (
            <div className='space-y-6 py-1'>
              {arrayField.state.value.map((_: any, i: number) => (
                <div key={i} className='p-4 border border-border rounded-xl bg-muted/20 relative group'>
                  <div className='grid grid-cols-1 md:grid-cols-4 gap-6'>
                    <div className='col-span-1'>
                      <form.Field
                        name={`attributes[${i}].variantType`}
                        children={(field: any) => (
                          <TextInput
                            field={field}
                            label='Type'
                            placeholder='e.g. Color'
                            // Focus the first input of the newly added variant
                            ref={i === arrayField.state.value.length - 1 ? lastInputRef : null}
                          />
                        )}
                      />
                    </div>

                    <div className='col-span-3'>
                      <form.Field
                        name={`attributes[${i}].values`}
                        children={(valuesField: any) => (
                          <Field>
                            <Label>Values</Label>
                            <div className='flex items-center gap-2'>
                              <Input
                                placeholder="Type 'Red' then click Add"
                                value={tempInputs[i] || ''}
                                onChange={e => setTempInputs({ ...tempInputs, [i]: e.target.value })}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    e.stopPropagation() // Prevents form submission
                                    handleAddValue(i, valuesField)
                                  }
                                }}
                                className='flex-1'
                              />
                              <Button type='button' size='sm' tabIndex={0} onClick={() => handleAddValue(i, valuesField)}>
                                Add
                              </Button>
                            </div>

                            <div className='flex flex-wrap gap-2'>
                              {valuesField.state.value.map((v: any, vi: number) => (
                                <Badge key={vi} variant='secondary' className='pl-2 pr-1 py-1 gap-1 bg-background border'>
                                  {v.variantValue}
                                  <button
                                    type='button'
                                    onClick={e => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      const next = valuesField.state.value.filter((_: any, idx: number) => idx !== vi)
                                      valuesField.handleChange(next)
                                    }}
                                    className='rounded-full hover:bg-muted p-0.5 focus:outline-none focus:ring-1 focus:ring-ring'
                                    aria-label={`Remove ${v.variantValue}`}
                                  >
                                    <X className='w-3 h-3 text-muted-foreground hover:text-destructive' />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          </Field>
                        )}
                      />
                    </div>
                  </div>

                  <Button
                    variant='ghost'
                    size='icon'
                    type='button'
                    className='absolute -top-1 -right-1 h-7 w-7 bg-background border shadow-sm rounded-full'
                    onClick={() => arrayField.removeValue(i)}
                  >
                    <Trash2 className='w-3 h-3 text-muted-foreground hover:text-destructive' />
                  </Button>
                </div>
              ))}

              <Button
                type='button'
                variant='outline'
                onClick={() => {
                  arrayField.pushValue({ variantType: '', values: [] })
                  setTimeout(() => lastInputRef.current?.focus(), 0)
                }}
                className='w-full border-dashed'
              >
                <Plus className='w-4 h-4 mr-2 text-amber-500' /> Add Variant Type
              </Button>
            </div>
          )}
        </form.Field>
      </ScrollArea>

      <DialogFooter className='border-t border-border pt-4 bg-muted/10 -mx-6 px-6 -mb-6 pb-6'>
        <Button
          type='button'
          onClick={() => form.handleSubmit()}
          disabled={!canPreview || combinationCount === 0}
          className='bg-amber-600 px-10 hover:bg-amber-700 text-white'
        >
          {`Generate ${combinationCount} Combinations`}
          <ArrowRight className='ml-2 w-4 h-4' />
        </Button>
      </DialogFooter>
    </div>
  )
}
