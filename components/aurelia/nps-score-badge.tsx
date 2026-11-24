import { cn } from '@/lib/utils'
import { npsCategory, type NpsCategory } from '@/lib/aurelia/followup-shared'

const STYLES: Record<NpsCategory, string> = {
  promotor: 'border-chart-2/30 bg-chart-2/10 text-chart-2',
  pasivo: 'border-border bg-muted text-foreground',
  detractor: 'border-destructive/30 bg-destructive/10 text-destructive',
}

export const NPS_LABELS: Record<NpsCategory, string> = { promotor: 'Promotor', pasivo: 'Pasivo', detractor: 'Detractor' }

export function NpsScoreBadge({ nota, title, className }: { nota: number | null; title?: string; className?: string }) {
  if (nota === null) {
    return <span title={title} className={cn('inline-flex size-7 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground', className)}>—</span>
  }
  const category = npsCategory(nota)
  return (
    <span title={title ? `${title} · ${NPS_LABELS[category]}` : NPS_LABELS[category]} className={cn('inline-flex size-7 items-center justify-center rounded-md border text-xs font-semibold tabular-nums', STYLES[category], className)}>
      {nota}
    </span>
  )
}
