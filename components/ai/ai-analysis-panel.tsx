'use client'

import { Sparkles } from 'lucide-react'

export function AIAnalysisPanel({ content, analysis }: { content: string; analysis?: { optimization_score?: number; optimization_level?: string; recommendations?: Array<{ descripcion?: string }> } | null }) {
  const scoreMatch = content.match(/(?:optimization_score|score|scoring|calificaci[oó]n)\D{0,20}(\d{1,3})\s*(?:\/\s*100)?/i)
  const score = analysis?.optimization_score ?? (scoreMatch ? Math.min(100, Number(scoreMatch[1])) : null)
  const levelMatch = content.match(/\b(baja|intermedia|alta)\b/i)
  const level = analysis?.optimization_level ?? levelMatch?.[1]?.toLowerCase() ?? null
  const temperature = level === 'alta' ? 'Alta' : level === 'intermedia' ? 'Intermedia' : level === 'baja' ? 'Baja' : null

  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 border-t bg-card p-4 lg:w-80 lg:border-l lg:border-t-0" aria-label="Análisis IA del cliente">
      <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-primary"><Sparkles className="size-4" aria-hidden="true" /><h2 className="text-sm font-semibold">Análisis IA</h2></div><span className="text-[11px] text-muted-foreground">Último análisis</span></div>
      {score !== null ? <><div><p className="text-xs text-muted-foreground">Scoring</p><p className="mt-1 text-4xl font-semibold tracking-tight">{score}<span className="text-base font-normal text-muted-foreground">/100</span></p><div className="mt-3 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${score}%` }} /></div></div><div><p className="text-xs text-muted-foreground">Optimización</p><p className="mt-1 text-sm font-medium">{temperature ?? 'Sin clasificar'}</p></div><div><p className="mb-2 text-xs font-medium text-primary">Recomendaciones</p><p className="text-sm leading-6 text-muted-foreground">El performance analyst analiza la evidencia del cliente y propone las próximas acciones.</p></div></> : <div className="rounded-md border border-dashed p-4 text-sm leading-6 text-muted-foreground">El score y la temperatura aparecerán acá cuando el performance analyst complete un análisis de este cliente.</div>}
    </aside>
  )
}
