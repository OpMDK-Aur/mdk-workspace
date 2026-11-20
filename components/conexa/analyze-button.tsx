'use client'

import { Sparkles } from 'lucide-react'

interface AnalyzeWithConexaButtonProps {
  context: string
  onClick?: () => void
}

export function AnalyzeWithConexaButton({ context, onClick }: AnalyzeWithConexaButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Analizar campañas con Conexa: ${context}`}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-primary bg-card px-4 text-[13px] font-medium text-primary transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
    >
      <Sparkles data-icon="inline-start" size={14} strokeWidth={2} aria-hidden="true" />
      Analizar campañas con Conexa
    </button>
  )
}

export type { AnalyzeWithConexaButtonProps }
