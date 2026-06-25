'use client'

import * as React from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'

interface MultiSelectOption {
  value: string
  label: string
}

interface MultiSelectProps {
  options: MultiSelectOption[]
  values: string[]
  onValuesChange: (values: string[]) => void
  placeholder?: string
  className?: string
  icon?: React.ReactNode
}

export const MultiSelect = React.forwardRef<HTMLButtonElement, MultiSelectProps>(
  (
    {
      options,
      values,
      onValuesChange,
      placeholder = 'Seleccionar...',
      className,
      icon,
    },
    ref
  ) => {
    const [open, setOpen] = React.useState(false)

    const handleSelect = (value: string) => {
      const newValues = values.includes(value)
        ? values.filter(v => v !== value)
        : [...values, value]
      onValuesChange(newValues)
    }

    const handleRemove = (value: string) => {
      onValuesChange(values.filter(v => v !== value))
    }

    const handleClear = () => {
      onValuesChange([])
    }

    const selectedOptions = options.filter(opt => values.includes(opt.value))
    const displayText = values.length === 0 
      ? placeholder 
      : values.length === options.length 
      ? 'Todos seleccionados'
      : `${values.length} seleccionado${values.length > 1 ? 's' : ''}`

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            variant="outline"
            className={cn('w-[200px] justify-between', className)}
          >
            <div className="flex items-center gap-2">
              {icon && icon}
              <span className="truncate">{displayText}</span>
            </div>
            <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[250px] p-3" align="start">
          <div className="space-y-3">
            {/* Select All / Clear All */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => onValuesChange(options.map(o => o.value))}
              >
                Todos
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={handleClear}
              >
                Limpiar
              </Button>
            </div>

            {/* Divider */}
            <div className="h-px bg-border" />

            {/* Options */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {options.map((option) => (
                <div key={option.value} className="flex items-center gap-2">
                  <Checkbox
                    id={option.value}
                    checked={values.includes(option.value)}
                    onCheckedChange={() => handleSelect(option.value)}
                  />
                  <label
                    htmlFor={option.value}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                  >
                    {option.label}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    )
  }
)

MultiSelect.displayName = 'MultiSelect'
