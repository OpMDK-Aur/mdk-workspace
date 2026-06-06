'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { MessageCircle, X } from 'lucide-react'

interface CellNoteProps {
  value?: string
  onChange?: (value: string) => void
  className?: string
}

export function CellNote({ value = '', onChange, className }: CellNoteProps) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(value)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setNote(value)
  }, [value])

  const handleSave = () => {
    onChange?.(note)
    setOpen(false)
  }

  const handleClear = () => {
    setNote('')
    onChange?.('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant={value ? 'default' : 'ghost'}
          className={cn('h-6 w-6', value && 'bg-primary/10 hover:bg-primary/20', className)}
          title={value ? `Nota: ${value.slice(0, 50)}...` : 'Agregar nota'}
        >
          <MessageCircle className={cn('h-3.5 w-3.5', value ? 'text-primary' : 'text-muted-foreground')} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Nota de Célula</h4>
          <Textarea
            ref={textareaRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Escribe una nota..."
            className="min-h-24 text-xs"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              className="flex-1"
            >
              Guardar
            </Button>
            {value && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleClear}
                className="text-xs"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
