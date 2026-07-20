'use client'

import { Button } from '@/components/ui/button'
import { Bold, Italic, Underline, Strikethrough, Code, List, ListOrdered } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CommentFormattingToolbarProps {
  onFormat: (format: string) => void
  className?: string
  compact?: boolean
}

export function CommentFormattingToolbar({ onFormat, className = '', compact = false }: CommentFormattingToolbarProps) {
  return (
    <div className={cn(
      "flex gap-1 p-2 bg-muted/30 rounded-md border border-border/50",
      compact && "gap-0.5 p-1",
      className
    )}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("h-7 w-7 hover:bg-accent", compact && "h-6 w-6")}
        onClick={() => onFormat('bold')}
        title="Negrita (Ctrl+B)"
      >
        <Bold className={cn("h-3.5 w-3.5", compact && "h-3 w-3")} />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("h-7 w-7 hover:bg-accent", compact && "h-6 w-6")}
        onClick={() => onFormat('italic')}
        title="Cursiva (Ctrl+I)"
      >
        <Italic className={cn("h-3.5 w-3.5", compact && "h-3 w-3")} />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("h-7 w-7 hover:bg-accent", compact && "h-6 w-6")}
        onClick={() => onFormat('underline')}
        title="Subrayado (Ctrl+U)"
      >
        <Underline className={cn("h-3.5 w-3.5", compact && "h-3 w-3")} />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("h-7 w-7 hover:bg-accent", compact && "h-6 w-6")}
        onClick={() => onFormat('strikethrough')}
        title="Tachado"
      >
        <Strikethrough className={cn("h-3.5 w-3.5", compact && "h-3 w-3")} />
      </Button>

      <div className="w-px bg-border/50" />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("h-7 w-7 hover:bg-accent", compact && "h-6 w-6")}
        onClick={() => onFormat('code')}
        title="Código"
      >
        <Code className={cn("h-3.5 w-3.5", compact && "h-3 w-3")} />
      </Button>

      <div className="w-px bg-border/50" />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("h-7 w-7 hover:bg-accent", compact && "h-6 w-6")}
        onClick={() => onFormat('list')}
        title="Lista sin ordenar"
      >
        <List className={cn("h-3.5 w-3.5", compact && "h-3 w-3")} />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("h-7 w-7 hover:bg-accent", compact && "h-6 w-6")}
        onClick={() => onFormat('ordered')}
        title="Lista numerada"
      >
        <ListOrdered className={cn("h-3.5 w-3.5", compact && "h-3 w-3")} />
      </Button>
    </div>
  )
}
