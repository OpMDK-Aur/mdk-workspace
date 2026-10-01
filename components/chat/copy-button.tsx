'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const CONTENT_COPY_PATH =
  'M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-240v-480 480Z'
const CHECK_PATH = 'M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z'

export function MaterialIcon({ path, className }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" className={cn('size-4 shrink-0', className)}>
      <path d={path} />
    </svg>
  )
}

export function CopyButton({
  getText,
  label = 'Copiar',
  showLabel = false,
  className,
}: {
  getText: () => string
  label?: string
  showLabel?: boolean
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(getText())
      setCopied(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copiado' : label}
      title={copied ? 'Copiado' : label}
      className={cn('inline-flex items-center gap-1.5 transition-colors', copied && 'text-emerald-600', className)}
    >
      <MaterialIcon path={copied ? CHECK_PATH : CONTENT_COPY_PATH} />
      {showLabel && <span>{copied ? 'Copiado' : label}</span>}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copiado al portapapeles' : ''}
      </span>
    </button>
  )
}
