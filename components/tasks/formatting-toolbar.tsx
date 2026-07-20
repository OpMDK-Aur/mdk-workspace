'use client'

import { Bold, Italic, Code, Link2, List, ListOrdered, Heading2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface FormattingToolbarProps {
  onFormat: (format: string) => void
  disabled?: boolean
}

export function FormattingToolbar({ onFormat, disabled = false }: FormattingToolbarProps) {
  const formatOptions = [
    { icon: Bold, label: 'Negrita', format: 'bold', hotkey: 'Ctrl+B' },
    { icon: Italic, label: 'Cursiva', format: 'italic', hotkey: 'Ctrl+I' },
    { icon: Code, label: 'Código', format: 'code', hotkey: 'Ctrl+`' },
    { icon: Link2, label: 'Enlace', format: 'link', hotkey: 'Ctrl+K' },
    { icon: List, label: 'Lista', format: 'list', hotkey: 'Ctrl+L' },
    { icon: ListOrdered, label: 'Lista numerada', format: 'ordered', hotkey: 'Ctrl+O' },
  ]

  return (
    <div className="flex items-center gap-1 p-1.5 bg-muted/50 rounded-md border border-border/50">
      {formatOptions.map(({ icon: Icon, label, format }) => (
        <Button
          key={format}
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          title={label}
          onClick={() => onFormat(format)}
          disabled={disabled}
        >
          <Icon className="h-4 w-4" />
        </Button>
      ))}
    </div>
  )
}
