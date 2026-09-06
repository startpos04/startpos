import { Badge } from '@platform/components/ui/badge'
import { Button } from '@platform/components/ui/button'
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@platform/components/ui/command'
import { Field } from '@platform/components/ui/field'
import { Label } from '@platform/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@platform/components/ui/popover'
import { cn } from '@platform/lib/utils'
import type { AnyFieldApi } from '@tanstack/react-form'
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react'
import * as React from 'react'

interface SelectInputProps<T> extends Omit<SelectProps<T>, 'value' | 'onChange'> {
  label?: string
  field: AnyFieldApi
}

export function SelectInput<T>({ label, field, options, ...props }: SelectInputProps<T>) {
  return (
    <Field>
      <Label className='empty:hidden'>{label}</Label>
      <Select<T> options={options} value={field.state.value} onChange={field.handleChange} {...props} />
      {field.state.meta.errors.length > 0 && <p className='text-xs text-destructive'>{field.state.meta.errors.map(err => err.message ?? err).join(', ')}</p>}
    </Field>
  )
}

interface Option {
  label: string
  value: string
}

interface SelectProps<T> {
  options: { value: string; label: string; data?: T }[]
  value: string | string[]
  onChange: (value: string | string[]) => void
  onCreate?: (inputValue: string) => Promise<Option | undefined>
  placeholder?: string
  multiple?: boolean
  creatable?: boolean
  searchable?: boolean
  disabled?: boolean
}

function Select<T>({ options: initialOptions, value, onChange, onCreate, placeholder, multiple, creatable, searchable }: SelectProps<T>) {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState('')
  const [isCreating, setIsCreating] = React.useState(false)
  const [options, setOptions] = React.useState<Option[]>(initialOptions)

  // Force searchable to be true if the component needs to create options
  const isSearchable = searchable || creatable

  // Normalize array internally for matching consistency
  const selectedValues = React.useMemo(() => {
    if (!value) return []
    return Array.isArray(value) ? value : [value]
  }, [value])

  React.useEffect(() => {
    setOptions(initialOptions)
  }, [initialOptions])

  const handleUnselect = (item: string) => {
    if (multiple) {
      onChange(selectedValues.filter(i => i !== item))
    } else {
      onChange('')
    }
  }

  const handleSelect = (currentValue: string) => {
    if (multiple) {
      if (selectedValues.includes(currentValue)) {
        onChange(selectedValues.filter(v => v !== currentValue))
      } else {
        onChange([...selectedValues, currentValue])
      }
    } else {
      onChange(currentValue)
      setOpen(false)
    }
  }

  const handleCreateOption = async () => {
    if (!creatable || !isSearchable || !inputValue.trim() || isCreating) return

    const trimmedInput = inputValue.trim()

    // Prevent duplicate entries by text comparison
    if (options.some(o => o.label.toLowerCase() === trimmedInput.toLowerCase())) return

    setIsCreating(true)
    try {
      if (onCreate) {
        const newOption = await onCreate(trimmedInput)
        if (newOption) {
          setOptions(prev => [...prev, newOption])
          handleSelect(newOption.value) // Selects the actual persisted DB ID
        }
      } else {
        // Fallback local creation if no onCreate function is defined
        const newValue = trimmedInput.toLowerCase().replace(/\s+/g, '-')
        const newOption = { label: trimmedInput, value: newValue }
        setOptions(prev => [...prev, newOption])
        handleSelect(newValue)
      }
      setInputValue('')
    } catch (error) {
      console.error(error)
    } finally {
      setIsCreating(false)
    }
  }

  // Determine if the "Create Option" element should append to the list
  const showCreate = creatable && isSearchable && inputValue.length > 0 && !options.some(option => option.label.toLowerCase() === inputValue.toLowerCase())

  // Apply conditional search filtration using the forced flag
  const filteredOptions = options.filter(option => {
    if (!isSearchable) return true // Show all items if search/searchable flag is false
    return option.label.toLowerCase().includes(inputValue.toLowerCase())
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant='outline' role='combobox' aria-expanded={open} className='w-full justify-between hover:bg-background '>
          <div className='flex flex-wrap gap-1 max-w-[90%] text-left'>
            {selectedValues.length > 0 ? (
              multiple ? (
                selectedValues.map(val => {
                  const option = options.find(o => o.value === val)
                  return (
                    <Badge key={val} variant='secondary' className='rounded-sm px-1 text-xs font-normal flex items-center gap-1'>
                      {option ? option.label : val}
                      <button
                        type='button'
                        className='ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2'
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleUnselect(val)
                        }}
                        onMouseDown={e => {
                          e.preventDefault()
                          e.stopPropagation()
                        }}
                        onClick={() => handleUnselect(val)}
                      >
                        <X className='size-3 text-muted-foreground hover:text-foreground' />
                      </button>
                    </Badge>
                  )
                })
              ) : (
                <span className='text-xs font-normal text-foreground'>{options.find(o => o.value === selectedValues[0])?.label || selectedValues[0]}</span>
              )
            ) : (
              <span className='text-muted-foreground text-xs font-normal'>{placeholder}</span>
            )}
          </div>
          <ChevronsUpDown className='size-4 shrink-0 opacity-50 ml-2 self-center' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-full min-w-(--radix-popover-trigger-width) p-0' align='start'>
        <Command shouldFilter={false}>
          {isSearchable && (
            <CommandInput
              placeholder={creatable ? 'Search or type to create...' : 'Search...'}
              value={inputValue}
              onValueChange={setInputValue}
              disabled={isCreating}
              onKeyDown={e => {
                if (e.key === 'Enter' && showCreate) {
                  handleCreateOption()
                }
              }}
            />
          )}
          <CommandList>
            <CommandGroup>
              {filteredOptions.map(option => {
                const isSelected = selectedValues.includes(option.value)
                return (
                  <CommandItem key={option.value} value={option.value} onSelect={() => handleSelect(option.value)}>
                    <Check className={cn('mr-2 h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                    {option.label}
                  </CommandItem>
                )
              })}

              {showCreate && (
                <CommandItem value={inputValue} onSelect={handleCreateOption} className='text-primary font-medium cursor-pointer flex items-center gap-2'>
                  {isCreating ? (
                    <>
                      <Loader2 className='h-3 w-3 animate-spin text-muted-foreground' />
                      <span className='text-muted-foreground truncate'>Creating "{inputValue}"...</span>
                    </>
                  ) : (
                    <span className='truncate'>Create "{inputValue}"</span>
                  )}
                </CommandItem>
              )}

              {filteredOptions.length === 0 && !showCreate && <div className='py-6 text-center text-sm text-muted-foreground'>No options found.</div>}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
