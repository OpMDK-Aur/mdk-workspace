'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { CreativeMetric, RankedCreative, TopCreativesResult } from '@/lib/meta/top-creatives'

const stripedBackground = 'repeating-linear-gradient(45deg,#F0F0F0,#F0F0F0 8px,#E6E6E3 8px,#E6E6E3 16px)'

const METRIC_LABELS: Record<CreativeMetric, string> = {
  reach: 'Alcance',
  impressions: 'Impresiones',
  ctr: 'CTR',
  cpl: 'CPL',
  cpc: 'CPC',
  spend: 'Inversión',
  leads: 'Leads',
  frequency: 'Frecuencia',
}

const integerFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const decimalFormatter = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const frequencyFormatter = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatCurrency(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
  } catch {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value)
  }
}

function formatMetric(metric: CreativeMetric, value: number, currency: string) {
  if (metric === 'cpl' || metric === 'cpc' || metric === 'spend') return formatCurrency(value, currency)
  if (metric === 'ctr') return `${decimalFormatter.format(value)}%`
  if (metric === 'frequency') return frequencyFormatter.format(value)
  return integerFormatter.format(value)
}

function secondaryMetrics(creative: RankedCreative, highlighted: CreativeMetric) {
  const all: Array<{ metric: CreativeMetric; text: string }> = [
    { metric: 'impressions', text: `${integerFormatter.format(creative.impressions)} impr.` },
    { metric: 'ctr', text: `CTR ${decimalFormatter.format(creative.ctr)}%` },
    { metric: 'spend', text: formatCurrency(creative.spend, creative.currency) },
    { metric: 'leads', text: `${integerFormatter.format(creative.leads)} leads` },
  ]
  return all.filter((item) => item.metric !== highlighted).slice(0, 3)
}

const refreshedThumbnails = new Map<string, Promise<string | null>>()

function refreshThumbnail(adId: string) {
  let pending = refreshedThumbnails.get(adId)
  if (!pending) {
    pending = fetch(`/api/ads/meta/creative-thumbnail?ad_id=${encodeURIComponent(adId)}`)
      .then((response) => (response.ok ? (response.json() as Promise<{ thumbnail: string | null }>) : { thumbnail: null }))
      .then((data) => data.thumbnail)
      .catch(() => null)
    refreshedThumbnails.set(adId, pending)
  }
  return pending
}

function CreativeImage({ creative, large = false }: { creative: RankedCreative; large?: boolean }) {
  const adId = creative.adId ?? creative.id
  const [src, setSrc] = useState(creative.thumbnail)
  const [retried, setRetried] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(src) && !failed && !refreshing

  function handleError() {
    if (retried || !adId) {
      setFailed(true)
      return
    }
    setRetried(true)
    setRefreshing(true)
    refreshThumbnail(adId).then((fresh) => {
      setRefreshing(false)
      if (fresh && fresh !== src) setSrc(fresh)
      else setFailed(true)
    })
  }

  return (
    <>
      <div className="absolute inset-0" style={{ background: stripedBackground }} aria-hidden="true" />
      {refreshing && creative.format && (
        <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] text-[#5C5C5C]" aria-hidden="true">{creative.format}</span>
      )}
      {showImage && (
        <img
          key={src ?? ''}
          src={src ?? ''}
          alt={creative.name}
          referrerPolicy="no-referrer"
          loading={large ? 'eager' : 'lazy'}
          className={large ? 'absolute inset-0 h-full w-full object-contain' : 'absolute inset-0 h-full w-full object-cover'}
          onError={handleError}
        />
      )}
    </>
  )
}

function CreativeTile({ creative, metric, onOpen }: { creative: RankedCreative; metric: CreativeMetric; onOpen: () => void }) {
  return (
    <article className="overflow-hidden rounded-[14px] border border-[#E6E6E3] bg-white">
      <button
        type="button"
        onClick={onOpen}
        className="relative block aspect-square w-full overflow-hidden bg-[#F5F5F3] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#141414]"
        aria-label={`Ver creativo ${creative.name} en grande`}
      >
        <CreativeImage creative={creative} />
        <span className="absolute left-2 top-2 rounded-full bg-[#141414] px-2 py-0.5 text-[11px] font-semibold text-white">{`#${creative.rank}`}</span>
        {creative.format && (
          <span className="absolute right-2 top-2 rounded-[5px] bg-white/90 px-2 py-[3px] font-mono text-[11px] text-[#5C5C5C]">{creative.format}</span>
        )}
      </button>
      <div className="p-3">
        <p className="text-[18px] font-bold tabular-nums text-[#141414]">{formatMetric(metric, creative.value, creative.currency)}</p>
        <p className="text-[11.5px] text-[#6B6B6B]">{METRIC_LABELS[metric]}</p>
        <div className="mt-2 flex justify-between gap-2 border-t border-[#F5F5F3] pt-2 text-[11.5px] tabular-nums text-[#5C5C5C]">
          {secondaryMetrics(creative, metric).map((item) => <span key={item.metric}>{item.text}</span>)}
        </div>
        <p className="mt-2 truncate text-[11px] text-[#9A9A9A]" title={creative.campaign ? `${creative.name} · ${creative.campaign}` : creative.name}>
          {creative.campaign ? `${creative.name} · ${creative.campaign}` : creative.name}
        </p>
      </div>
    </article>
  )
}

function StateMessage({ children }: { children: string }) {
  return <p className="mt-2.5 rounded-[14px] border border-[#E6E6E3] bg-white p-6 text-center text-[12px] text-[#9A9A9A]">{children}</p>
}

function isTopCreativesResult(value: unknown): value is TopCreativesResult {
  return !!value && typeof value === 'object' && Array.isArray((value as TopCreativesResult).items) && typeof (value as TopCreativesResult).metric === 'string'
}

export function ChatCreativesSkeleton() {
  return (
    <div className="mt-2.5 grid grid-cols-3 gap-2.5" aria-busy="true">
      <span className="sr-only">Cargando creativos</span>
      {[0, 1, 2].map((n) => <div key={n} className="aspect-square animate-pulse rounded-[14px] bg-[#F5F5F3]" />)}
    </div>
  )
}

export function ChatCreatives({ data }: { data: unknown }) {
  const [openId, setOpenId] = useState<string | null>(null)
  if (!isTopCreativesResult(data)) return null
  if (data.status === 'inactive') return <StateMessage>La cuenta de Meta no tuvo inversión en este período.</StateMessage>
  if (data.status === 'unavailable') return <StateMessage>No pudimos traer los creativos de Meta para este período.</StateMessage>
  if (!data.items.length) return <StateMessage>No hay creativos de Meta con suficientes impresiones en este período.</StateMessage>

  const opened = data.items.find((item) => item.id === openId) ?? null
  return (
    <>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5 lg:grid-cols-3">
        {data.items.map((creative) => (
          <CreativeTile key={creative.id} creative={creative} metric={data.metric} onOpen={() => setOpenId(creative.id)} />
        ))}
      </div>
      <Dialog open={opened !== null} onOpenChange={(open) => { if (!open) setOpenId(null) }}>
        <DialogContent className="max-w-2xl bg-white p-4 text-[#141414]">
          {opened && (
            <div className="flex flex-col gap-3">
              <div className="relative aspect-square w-full overflow-hidden rounded-[10px] bg-[#F5F5F3]">
                <CreativeImage creative={opened} large />
              </div>
              <div className="flex flex-col gap-0.5">
                <DialogTitle className="text-[14px] font-semibold text-[#141414]">{opened.name}</DialogTitle>
                <DialogDescription className="text-[12px] text-[#6B6B6B]">
                  {`${METRIC_LABELS[data.metric]} ${formatMetric(data.metric, opened.value, opened.currency)}${opened.campaign ? ` · ${opened.campaign}` : ''}`}
                </DialogDescription>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
