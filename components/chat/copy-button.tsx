'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CopyButtonProps {
  /** Raw assistant message content (may include ```chart/pdf/image/file blocks) */
  content: string
  className?: string
}

// Strip special fenced blocks so the copied text is clean prose (like Claude).
function toPlainText(content: string): string {
  return content
    .replace(/```(chart|file|image|pdf)\n[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function CopyButton({ content, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      const plainText = toPlainText(content)
      console.log('[v0] Copying content length:', plainText.length)
      await navigator.clipboard.writeText(plainText)
      console.log('[v0] Copy successful')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('[v0] Copy failed:', e)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-all',
        copied
          ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-100'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        className,
      )}
      aria-label="Copiar respuesta"
      type="button"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 animate-bounce" />
          Copiado
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          Copiar
        </>
      )}
    </button>
  )
}
