import { Calendar as CalendarIcon, Check } from 'lucide-react'
import * as React from 'react'
import type { DateRange as DateRangeType } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import dayjs from '@/lib/dayjs'
import { cn } from '@/lib/utils'

export type DateRange = DateRangeType | undefined

interface DateRangeProps {
  className?: string
  value?: DateRange
  defaultValue?: DateRange
  onChange?: (range: DateRange) => void
  placeholder?: string
}

const presets = [
  { label: 'All Time', value: undefined },
  { label: 'Today', value: { from: dayjs().toDate(), to: dayjs().toDate() } },
  { label: 'Yesterday', value: { from: dayjs().subtract(1, 'day').toDate(), to: dayjs().subtract(1, 'day').toDate() } },
  { label: 'Last 7 Days', value: { from: dayjs().subtract(6, 'days').toDate(), to: dayjs().toDate() } },
  { label: 'Last 30 Days', value: { from: dayjs().subtract(29, 'days').toDate(), to: dayjs().toDate() } },
  { label: 'This Month', value: { from: dayjs().startOf('month').toDate(), to: dayjs().endOf('month').toDate() } },
  {
    label: 'Last Month',
    value: {
      from: dayjs().subtract(1, 'month').startOf('month').toDate(),
      to: dayjs().subtract(1, 'month').endOf('month').toDate(),
    },
  },
]

export function DateRangeInput({ className, value: controlledValue, defaultValue, onChange, placeholder }: DateRangeProps) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState<DateRangeType | undefined>(defaultValue)
  const [open, setOpen] = React.useState(false)

  const isControlled = controlledValue !== undefined
  const activeValue = isControlled ? controlledValue : uncontrolledValue

  const [tempDate, setTempDate] = React.useState<DateRangeType | undefined>(activeValue)

  const onOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (newOpen) {
      setTempDate(activeValue)
    }
  }

  const handleConfirm = () => {
    if (!isControlled) {
      setUncontrolledValue(tempDate)
    }
    onChange?.(tempDate ? { from: tempDate.from, to: tempDate.to } : undefined)
    setOpen(false)
  }

  const getDisplayText = () => {
    if (!activeValue?.from) return placeholder

    const activePreset = presets.find(
      p => activeValue.from && activeValue.to && dayjs(p.value?.from).isSame(activeValue.from, 'day') && dayjs(p.value?.to).isSame(activeValue.to, 'day'),
    )

    if (activePreset) return activePreset.label

    const fromStr = dayjs(activeValue.from).format('MMM DD, YYYY')
    if (!activeValue.to) return fromStr

    return `${fromStr} - ${dayjs(activeValue.to).format('MMM DD, YYYY')}`
  }

  return (
    <div className={cn('grid gap-2', className)}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            id='date'
            variant={'outline'}
            size='sm'
            className={cn('min-w-20 justify-start text-left font-normal', !activeValue && 'text-muted-foreground')}
          >
            <CalendarIcon />
            <span className='truncate'>{getDisplayText()}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-auto p-0' align='end'>
          <div className='flex flex-nowrap'>
            <div className='flex flex-col border-r w-40 p-3 gap-1 bg-muted/10'>
              <p className='px-2 mb-2 text-[10px] uppercase font-bold tracking-wider text-muted-foreground'>Quick Select</p>
              {presets.map(preset => (
                <Button
                  key={preset.label}
                  variant='ghost'
                  size='sm'
                  className={cn(
                    'justify-start font-normal text-xs h-8',
                    tempDate?.from?.toDateString() === preset.value?.from?.toDateString() &&
                      tempDate?.to?.toDateString() === preset.value?.to?.toDateString() &&
                      'bg-accent text-accent-foreground',
                  )}
                  onClick={() => setTempDate(preset.value)}
                >
                  {preset.label}
                </Button>
              ))}

              <div className='mt-auto pt-4'>
                <Button size='sm' className='w-full text-xs h-8' onClick={handleConfirm} disabled={!tempDate?.from || !tempDate?.to}>
                  <Check className='size-3 mr-2' />
                  Confirm
                </Button>
              </div>
            </div>
            <Calendar mode='range' {...(tempDate?.from ? { defaultMonth: tempDate.from } : {})} selected={tempDate} onSelect={setTempDate} numberOfMonths={2} />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
