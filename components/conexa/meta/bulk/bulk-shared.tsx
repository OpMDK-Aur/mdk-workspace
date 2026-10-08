'use client'

import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BulkAsset, Ratio } from '@/lib/bulk/types'
import type { RowState } from '@/lib/bulk/validate'

export const INDIGO = '#5B5FE8'

const placeholderBackground = 'repeating-linear-gradient(45deg,#F0F0F0,#F0F0F0 6px,#E6E6E3 6px,#E6E6E3 12px)'
const THUMB_WIDTH: Record<Ratio, number> = { '9:16': 36, '4:5': 51, '1:1': 64, '1.91:1': 96 }

export function ConexaMark({ className }: { className?: string }) {
  return <span className={cn('font-semibold text-[#5B5FE8]', className)}>{'✦ Conexa'}</span>
}

export function AssetThumb({ asset }: { asset: BulkAsset }) {
  const width = THUMB_WIDTH[asset.ratio]
  return (
    <figure className="flex flex-col items-center gap-1">
      <div
        className={cn('relative h-16 overflow-hidden rounded-md', asset.pending ? 'border border-dashed border-[#5B5FE8]/60 bg-[#5B5FE8]/5' : 'border border-[#E6E6E3]')}
        style={{ width, background: asset.pending || !asset.url ? undefined : '#F0F0F0', backgroundImage: !asset.pending && !asset.url ? placeholderBackground : undefined }}
      >
        {asset.url && asset.kind === 'image' && <img src={asset.url} alt={asset.name} className="size-full object-cover" />}
        {asset.url && asset.kind === 'video' && <video src={asset.url} muted preload="metadata" className="size-full object-cover" aria-label={asset.name} />}
        {asset.kind === 'video' && !asset.pending && (
          <span className="absolute bottom-0.5 right-0.5 flex size-3.5 items-center justify-center rounded-full bg-[#141414]/70">
            <Play className="size-2 fill-white text-white" aria-hidden="true" />
            <span className="sr-only">Video</span>
          </span>
        )}
      </div>
      <figcaption className="font-mono text-[10px] text-[#777]">{asset.ratio}</figcaption>
    </figure>
  )
}

const STATE_STYLES: Record<RowState, { label: string; className: string }> = {
  listo: { label: 'LISTO', className: 'bg-[#e8f6ef] text-[#1e7d55]' },
  revisar: { label: 'REVISAR', className: 'bg-[#fdf3e1] text-[#a86412]' },
  borrador: { label: 'BORRADOR', className: 'bg-[#f0f0ed] text-[#666]' },
  error: { label: 'ERROR', className: 'bg-[#fdecec] text-[#c23b3b]' },
  publicado: { label: 'PUBLICADO', className: 'bg-[#e8f6ef] text-[#1e7d55]' },
}

export function StateBadge({ state }: { state: RowState }) {
  const style = STATE_STYLES[state]
  return <span className={cn('inline-flex rounded-[5px] px-1.5 py-0.5 text-[10px] font-bold tracking-wide', style.className)}>{style.label}</span>
}

export function Panel({ title, action, children, className }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-[#dcdcd8] bg-white p-4 text-[#141414]', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h3 className="text-[12px] font-semibold text-[#333]">{title}</h3>}
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
      className={cn('max-w-[220px] truncate rounded-full border px-3 py-1 text-[11px] transition-colors', active ? 'border-[#141414] bg-[#141414] text-white' : 'border-[#dcdcd8] bg-white text-[#555] hover:border-[#bbb]')}
    >
      {children}
    </button>
  )
}
