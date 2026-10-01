'use client'

import { useState } from 'react'
import { isPausedStatus, type CreativeCard as CreativeCardData } from '@/lib/meta/to-creative-card'

const thumbnailBackground = 'repeating-linear-gradient(45deg,#F0F0F0,#F0F0F0 8px,#E6E6E3 8px,#E6E6E3 16px)'

function formatSpend(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
  } catch {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value)
  }
}

export function CreativeCard({ creative }: { creative: CreativeCardData }) {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = Boolean(creative.thumbnail) && !imageFailed
  const paused = isPausedStatus(creative.status)
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#E6E6E3] bg-white">
      <div className="relative h-[120px] overflow-hidden">
        <div className="absolute inset-0" style={{ background: thumbnailBackground }} aria-hidden="true" />
        {showImage && (
          <img
            src={creative.thumbnail ?? ''}
            alt={creative.name}
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        )}
        {creative.format && (
          <span className="absolute left-2 top-2 rounded-[5px] bg-white/90 px-2 py-[3px] font-mono text-[11px] text-[#5C5C5C]">{creative.format}</span>
        )}
        {paused && (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-[5px] bg-white/90 px-2 py-[3px] text-[11px] text-[#5C5C5C]">
            <span className="size-1.5 rounded-full bg-[#9A9A9A]" aria-hidden="true" />
            Pausado
          </span>
        )}
      </div>
      <div className="p-[14px]">
        <p className="mb-0.5 truncate text-[13.5px] font-bold text-[#141414]" title={creative.name}>{creative.name}</p>
        {creative.campaign && (
          <p className="mb-2.5 truncate text-[11.5px] text-[#9A9A9A]" title={creative.campaign}>{creative.campaign}</p>
        )}
        <div className="flex justify-between gap-2 border-t border-[#F5F5F3] pt-2 text-[11.5px] text-[#5C5C5C]">
          <span>{creative.impressions.toLocaleString('es-AR')} impr.</span>
          <span>{'CTR ' + creative.ctr.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + '%'}</span>
          <span>{formatSpend(creative.spend, creative.currency)}</span>
        </div>
      </div>
    </div>
  )
}

function CreativeSkeleton() {
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#E6E6E3] bg-white" aria-hidden="true">
      <div className="h-[120px] animate-pulse bg-[#F5F5F3]" />
      <div className="flex flex-col gap-2 p-[14px]">
        <div className="h-3.5 w-2/3 animate-pulse rounded bg-[#F5F5F3]" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-[#F5F5F3]" />
        <div className="mt-1 h-3 w-full animate-pulse rounded bg-[#F5F5F3]" />
      </div>
    </div>
  )
}

function StateMessage({ children }: { children: string }) {
  return <p className="mb-6 rounded-[14px] border border-[#E6E6E3] bg-white p-8 text-center text-[12px] text-[#9A9A9A]">{children}</p>
}

export function CreativeGrid({ creatives, loading, error, periodLabel }: { creatives: CreativeCardData[]; loading: boolean; error: boolean; periodLabel: string }) {
  if (loading) {
    return (
      <div className="mb-6 grid grid-cols-3 gap-[14px]" aria-busy="true">
        <span className="sr-only">Cargando creativos</span>
        {Array.from({ length: 6 }, (_, index) => <CreativeSkeleton key={index} />)}
      </div>
    )
  }
  if (error) return <StateMessage>No pudimos traer los creativos de esta cuenta.</StateMessage>
  if (!creatives.length) return <StateMessage>No hay creativos con impresiones en este período.</StateMessage>
  return (
    <div className="mb-6">
      <p className="mb-3 text-[12px] text-[#9A9A9A]">{`${creatives.length} creativos · ${periodLabel}`}</p>
      <div className="grid grid-cols-3 gap-[14px]">
        {creatives.map((creative) => <CreativeCard key={creative.id} creative={creative} />)}
      </div>
    </div>
  )
}
