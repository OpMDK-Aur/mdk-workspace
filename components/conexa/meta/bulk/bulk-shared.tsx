'use client'

import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BulkAsset, Ratio } from '@/lib/bulk/types'
import type { RowState } from '@/lib/bulk/validate'

export const INDIGO = 'var(--primary)'

const placeholderBackground = 'repeating-linear-gradient(45deg,#F0F0F0,#F0F0F0 6px,#E6E6E3 6px,#E6E6E3 12px)'
const THUMB_WIDTH: Record<Ratio, number> = { '9:16': 36, '4:5': 51, '1:1': 64, '1.91:1': 96 }

export function ConexaMark({ className }: { className?: string }) {
  return <span className={cn('font-semibold text-primary', className)}>{'✦ Conexa'}</span>
}

export function AssetThumb({ asset }: { asset: BulkAsset }) {
  const width = THUMB_WIDTH[asset.ratio]
  return (
    <figure className="flex flex-col items-center gap-1">
      <div
        className={cn('relative h-16 overflow-hidden rounded-md', asset.pending ? 'border border-dashed border-primary/60 bg-primary/5' : 'border border-border')}
        style={{ width, background: asset.pending || !asset.url ? undefined : 'var(--border)', backgroundImage: !asset.pending && !asset.url ? placeholderBackground : undefined }}
      >
        {asset.url && asset.kind === 'image' && <img src={asset.url} alt={asset.name} className="size-full object-cover" />}
        {asset.url && asset.kind === 'video' && <video src={asset.url} muted preload="metadata" className="size-full object-cover" aria-label={asset.name} />}
        {asset.kind === 'video' && !asset.pending && (
          <span className="absolute bottom-0.5 right-0.5 flex size-3.5 items-center justify-center rounded-full bg-foreground/70">
            <Play className="size-2 fill-white text-white" aria-hidden="true" />
            <span className="sr-only">Video</span>
          </span>
        )}
      </div>
      <figcaption className="font-mono text-[10px] text-muted-foreground">{asset.ratio}</figcaption>
    </figure>
  )
}

const STATE_STYLES: Record<RowState, { label: string; className: string }> = {
  listo: { label: 'LISTO', className: 'bg-status-verde/10 text-status-verde' },
  revisar: { label: 'REVISAR', className: 'bg-[#fdf3e1] text-primary' },
  borrador: { label: 'BORRADOR', className: 'bg-muted text-muted-foreground' },
  error: { label: 'ERROR', className: 'bg-[#fdecec] text-destructive' },
  publicado: { label: 'PUBLICADO', className: 'bg-status-verde/10 text-status-verde' },
}

export function StateBadge({ state }: { state: RowState }) {
  const style = STATE_STYLES[state]
  return <span className={cn('inline-flex rounded-[5px] px-1.5 py-0.5 text-[10px] font-bold tracking-wide', style.className)}>{style.label}</span>
}

export function Panel({ title, action, children, className }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-border bg-card p-4 text-foreground', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h3 className="text-[12px] font-semibold text-foreground">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn('max-w-[220px] truncate rounded-full border px-3 py-1 text-[11px] transition-colors', active ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-muted-foreground hover:border-border')}
    >
      {children}
    </button>
  )
}
