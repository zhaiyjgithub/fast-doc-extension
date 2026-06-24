import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import type { DropdownProps } from 'react-day-picker'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function CalendarDropdown({ value, onChange, options }: DropdownProps) {
  return (
    <Select
      value={String(value)}
      onValueChange={(v) => {
        onChange?.({ target: { value: v } } as unknown as React.ChangeEvent<HTMLSelectElement>)
      }}
    >
      <SelectTrigger className="h-7 w-fit gap-1 border-0 bg-transparent pl-1.5 pr-1 text-sm font-medium shadow-none focus:ring-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options?.map((opt) => (
          <SelectItem key={opt.value} value={String(opt.value)} disabled={opt.disabled}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-2',
        month: 'flex flex-col gap-4',
        month_caption: 'flex justify-center pt-1 relative items-center',
        caption_label: 'text-sm font-medium',
        nav: 'flex items-center gap-1',
        button_previous: 'hidden',
        button_next: 'hidden',
        dropdowns: 'flex gap-1 items-center',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'text-muted-foreground rounded-md w-8 font-normal text-[0.8rem] text-center',
        week: 'flex w-full mt-2',
        day: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
        day_button: cn(buttonVariants({ variant: 'ghost' }), 'size-8 p-0 font-normal'),
        selected: '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary/90',
        today: '[&>button]:bg-accent [&>button]:text-accent-foreground',
        outside: '[&>button]:text-muted-foreground [&>button]:opacity-30',
        disabled: '[&>button]:text-muted-foreground [&>button]:opacity-50 [&>button]:pointer-events-none',
        range_start: 'rounded-l-md [&>button]:bg-primary [&>button]:text-primary-foreground',
        range_end: 'rounded-r-md [&>button]:bg-primary [&>button]:text-primary-foreground',
        range_middle: 'bg-accent',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? (
            <ChevronLeft className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          ),
        Dropdown: CalendarDropdown,
      }}
      {...props}
    />
  )
}
Calendar.displayName = 'Calendar'

export { Calendar }
