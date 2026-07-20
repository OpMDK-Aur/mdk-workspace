'use client'

import { useRef, useEffect, useState } from 'react'
import { FormattingToolbar } from './formatting-toolbar'
import { cn } from '@/lib/utils'

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  showToolbar?: boolean
  className?: string
  editorClassName?: string
  rows?: number
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Escribe aquí...',
  showToolbar = true,
  className = '',
  editorClassName = '',
  rows = 4,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [isComposing, setIsComposing] = useState(false)

  // Sincronizar el contenido del editor con el estado externo
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value
    }
  }, [value])

  const handleFormat = (format: string) => {
    document.execCommand('styleWithCSS', false, 'true')

    switch (format) {
      case 'bold':
        document.execCommand('bold', false)
        break
      case 'italic':
        document.execCommand('italic', false)
        break
      case 'code':
        // Crear un span con estilos de código
        const codeHTML = '<span style="background-color: rgba(0,0,0,0.1); padding: 0.2em 0.4em; border-radius: 3px; font-family: monospace; font-size: 0.9em;">código</span>'
        document.execCommand('insertHTML', false, codeHTML)
        break
      case 'link': {
        const url = prompt('Ingresa la URL:')
        if (url) {
          document.execCommand('createLink', false, url)
        }
        break
      }
      case 'list':
        document.execCommand('insertUnorderedList', false)
        break
      case 'ordered':
        document.execCommand('insertOrderedList', false)
        break
    }

    editorRef.current?.focus()
  }

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Permitir Tab para indentación
    if (e.key === 'Tab') {
      e.preventDefault()
      document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;')
    }

    // Atajos de teclado para formateo
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault()
        handleFormat('bold')
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault()
        handleFormat('italic')
      } else if (e.key === '`') {
        e.preventDefault()
        handleFormat('code')
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        handleFormat('link')
      }
    }
  }

  return (
    <div className={className}>
      {showToolbar && (
        <div className="mb-2">
          <FormattingToolbar onFormat={handleFormat} />
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        className={cn(
          'w-full px-3 py-2 text-sm border border-input rounded-md bg-background',
          'focus:outline-none focus:ring-2 focus:ring-primary/50',
          'min-h-fit overflow-auto whitespace-pre-wrap break-words',
          editorClassName
        )}
        style={{ minHeight: `${rows * 1.5}em` }}
      >
        {!value && <span className="text-muted-foreground">{placeholder}</span>}
      </div>
    </div>
  )
}
