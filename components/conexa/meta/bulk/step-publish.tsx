'use client'

import { useMemo, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { createDestination, primaryAsset, publishAd } from '@/lib/bulk/api'
import { adName } from '@/lib/bulk/group-assets'
import { useBulkStore } from '@/lib/bulk/store'
import { isNewDestinationId, type BulkAdset, type BulkRow } from '@/lib/bulk/types'
import { validateRow } from '@/lib/bulk/validate'
import { Panel, StateBadge } from './bulk-shared'

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'amber' }) {
  return (
    <div className={cn('rounded-xl border bg-white p-4', tone === 'amber' ? 'border-[#f0d9b0]' : 'border-[#dcdcd8]')}>
      <p className="text-[11px] text-[#777]">{label}</p>
      <p className={cn('mt-1 text-[24px] font-bold tabular-nums', tone === 'amber' ? 'text-[#a86412]' : 'text-[#141414]')}>{value}</p>
    </div>
  )
}

function Check({ tone, children }: { tone: 'ok' | 'warn' | 'muted'; children: React.ReactNode }) {
  const mark = { ok: { symbol: '✓', className: 'bg-[#e8f6ef] text-[#1e7d55]' }, warn: { symbol: '!', className: 'bg-[#fdf3e1] text-[#a86412]' }, muted: { symbol: '•', className: 'bg-[#f0f0ed] text-[#888]' } }[tone]
  return (
    <li className="flex items-start gap-2.5 text-[12px] leading-relaxed text-[#333]">
      <span className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold', mark.className)} aria-hidden="true">{mark.symbol}</span>
      {children}
    </li>
  )
}

function NameLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex min-w-0 gap-2 text-[11.5px]">
      <span className="w-[68px] shrink-0 text-[#888]">{label}</span>
      <span className="truncate font-mono text-[#141414]" title={value}>{value}</span>
    </p>
  )
}

const isValidUrl = (value: string) => { try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false } }
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Error desconocido'

export function StepPublish({ clientId, clientName, adsets, destinationUrl }: { clientId: string; clientName: string; adsets: BulkAdset[]; destinationUrl?: string | null }) {
  const rows = useBulkStore((state) => state.rows)
  const initialStatus = useBulkStore((state) => state.initialStatus)
  const setInitialStatus = useBulkStore((state) => state.setInitialStatus)
  const phase = useBulkStore((state) => state.publishPhase)
  const progress = useBulkStore((state) => state.publishProgress)
  const setPublishPhase = useBulkStore((state) => state.setPublishPhase)
  const updateRow = useBulkStore((state) => state.updateRow)
  const updateDestination = useBulkStore((state) => state.updateDestination)
  const storedLink = useBulkStore((state) => state.link)
  const setLink = useBulkStore((state) => state.setLink)
  const setStep = useBulkStore((state) => state.setStep)
  const reset = useBulkStore((state) => state.reset)
  const [retrying, setRetrying] = useState<string[]>([])
  const [publishTotal, setPublishTotal] = useState(0)
  const link = storedLink || destinationUrl || ''
  const linkValid = isValidUrl(link)

  const nameOf = (row: BulkRow) => {
    const adset = adsets.find((item) => item.id === row.adsetId)
    return row.adName?.trim() || adName({ clientName, adsetName: adset?.name ?? '', baseName: row.baseName, index: rows.indexOf(row) })
  }

  const groups = useMemo(() => {
    const withState = rows.map((row) => ({ row, state: validateRow(row).state }))
    return {
      ready: withState.filter((item) => item.state === 'listo' && item.row.status !== 'done').map((item) => item.row),
      review: withState.filter((item) => item.state === 'revisar').length,
      drafts: withState.filter((item) => item.state === 'borrador').length,
      done: rows.filter((row) => row.status === 'done'),
      errors: rows.filter((row) => row.status === 'error'),
      files: rows.reduce((sum, row) => sum + row.assets.filter((asset) => !asset.pending).length, 0),
    }
  }, [rows])

  const tree = useMemo(() => {
    const campaigns = new Map<string, { name: string; isNew: boolean; adsets: Map<string, { name: string; isNew: boolean; ads: string[] }> }>()
    for (const row of groups.ready) {
      const adset = adsets.find((item) => item.id === row.adsetId)
      const campaignKey = adset?.campaignId ?? 'missing'
      const campaign = campaigns.get(campaignKey) ?? { name: adset?.campaignName ?? 'Sin conjunto asignado', isNew: !!adset && adset.campaignId.endsWith('_campaign'), adsets: new Map() }
      const adsetKey = adset?.id ?? 'missing'
      const group = campaign.adsets.get(adsetKey) ?? { name: adset?.name ?? '—', isNew: !!adset && isNewDestinationId(adset.id), ads: [] }
      group.ads.push(nameOf(row))
      campaign.adsets.set(adsetKey, group)
      campaigns.set(campaignKey, campaign)
    }
    return [...campaigns.entries()].map(([key, campaign]) => ({ key, ...campaign, adsets: [...campaign.adsets.entries()].map(([adsetKey, adset]) => ({ key: adsetKey, ...adset })) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.ready, adsets])

  const missingAdset = groups.ready.some((row) => !adsets.some((item) => item.id === row.adsetId))
  const statusLabel = initialStatus === 'PAUSED' ? 'pausados' : 'activos'

  async function resolveAdsetId(adsetId: string) {
    if (!isNewDestinationId(adsetId)) return adsetId
    const destination = useBulkStore.getState().destinations.find((item) => item.id === adsetId)
    if (!destination) throw new Error('El destino nuevo ya no existe. Volvé a elegir el conjunto.')
    if (destination.created) return destination.created.adsetId
    const created = await createDestination({ clientId, destination, status: initialStatus })
    updateDestination(destination.id, { created })
    return created.adsetId
  }

  async function publishOne(row: BulkRow) {
    const adset = adsets.find((item) => item.id === row.adsetId)
    const name = nameOf(row)
    updateRow(row.id, { status: 'creating', error: undefined })
    try {
      if (!adset) throw new Error('Elegí un conjunto de anuncios.')
      if (!primaryAsset(row.assets)) throw new Error('El anuncio no tiene un archivo listo para subir.')
      const metaAdsetId = await resolveAdsetId(row.adsetId)
      const result = await publishAd({ clientId, row, adsetId: metaAdsetId, name, status: initialStatus, link })
      updateRow(row.id, { status: 'done', metaAdId: result.adId, published: { campaignName: adset.campaignName, adsetName: adset.name, adName: name, adsetId: metaAdsetId, accountId: result.accountId } })
    } catch (error) {
      updateRow(row.id, { status: 'error', error: errorText(error) })
    }
  }

  async function publish() {
    const batch = groups.ready
    if (!batch.length || !linkValid) return
    setPublishTotal(batch.length)
    setPublishPhase('publishing', 0)
    // Secuencial: los anuncios del mismo destino nuevo comparten la campaña y el conjunto creados por el primero.
    for (const [index, row] of batch.entries()) {
      await publishOne(row)
      setPublishPhase('publishing', index + 1)
    }
    setPublishPhase('finished')
  }

  async function retry(row: BulkRow) {
    setRetrying((ids) => [...ids, row.id])
    await publishOne(row)
    setRetrying((ids) => ids.filter((id) => id !== row.id))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Anuncios a publicar" value={groups.ready.length} />
        <Stat label="Archivos" value={groups.files} />
        <Stat label="Para revisar" value={groups.review} tone={groups.review > 0 ? 'amber' : undefined} />
        <Stat label="En borrador" value={groups.drafts} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Qué se crea en Meta">
          {tree.length ? (
            <ul className="flex flex-col gap-3">
              {tree.map((campaign) => (
                <li key={campaign.key} className="rounded-lg border border-[#eee] p-3">
                  <p className="flex items-center gap-2 text-[11px] text-[#888]">
                    Campaña
                    {campaign.isNew && <span className="rounded-full bg-[#5B5FE8]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#3c3fb0]">Nueva</span>}
                  </p>
                  <p className={cn('truncate font-mono text-[12px] font-semibold', campaign.key === 'missing' ? 'text-[#a86412]' : 'text-[#141414]')} title={campaign.name}>{campaign.name}</p>
                  <ul className="mt-2 flex flex-col gap-2 border-l border-[#e6e6e3] pl-3">
                    {campaign.adsets.map((adset) => (
                      <li key={adset.key}>
                        <p className="flex items-center gap-2 text-[11px] text-[#888]">
                          Conjunto
                          {adset.isNew && <span className="rounded-full bg-[#5B5FE8]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#3c3fb0]">Nuevo</span>}
                        </p>
                        <p className="truncate font-mono text-[11.5px] text-[#141414]" title={adset.name}>{adset.name}</p>
                        <ul className="mt-1 flex flex-col gap-0.5 border-l border-[#e6e6e3] pl-3">
                          {adset.ads.map((name, index) => <li key={`${name}-${index}`} className="truncate font-mono text-[11px] text-[#555]" title={name}>{name}</li>)}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : <p className="text-[12px] text-[#999]">No hay anuncios listos para publicar.</p>}
        </Panel>

        <Panel title={<>{'Controles de '}<span className="text-[#5B5FE8]">{'✦ Conexa'}</span></>}>
          <ul className="flex flex-col gap-2">
            <Check tone={missingAdset ? 'warn' : 'ok'}>{missingAdset ? 'Hay anuncios sin conjunto: elegilos en el paso anterior.' : 'Todos los anuncios tienen campaña y conjunto.'}</Check>
            <Check tone={linkValid ? 'ok' : 'warn'}>{linkValid ? 'URL de destino válida.' : 'Falta la URL de destino de los anuncios.'}</Check>
            <Check tone={groups.review > 0 ? 'warn' : 'ok'}>{groups.review > 0 ? `${groups.review} ${groups.review === 1 ? 'anuncio necesita' : 'anuncios necesitan'} revisión de textos: no se publican.` : 'Textos principales y títulos completos.'}</Check>
            <Check tone="muted">{groups.drafts > 0 ? `${groups.drafts} ${groups.drafts === 1 ? 'borrador' : 'borradores'} sin archivo quedan fuera del lote.` : 'Sin borradores pendientes.'}</Check>
            <Check tone="muted">Se sube un archivo por anuncio, priorizando 4:5 y 1:1 para feed.</Check>
          </ul>
        </Panel>
      </div>

      <Panel title="Publicar en Meta Ads">
        {phase === 'publishing' ? (
          <div className="flex flex-col gap-2" role="status">
            <p className="text-[12px] text-[#333]">{`Subiendo archivo y creando anuncio ${Math.min(progress + 1, publishTotal)} de ${publishTotal}…`}</p>
            <Progress value={publishTotal ? (progress / publishTotal) * 100 : 0} className="h-2 bg-[#5B5FE8]/15 [&>[data-slot=progress-indicator]]:bg-[#5B5FE8]" />
          </div>
        ) : phase === 'finished' ? (
          <div className="flex flex-col gap-4">
            {groups.done.length > 0 && (
              <div className="rounded-lg border border-[#bfe5d2] bg-[#e8f6ef] p-4">
                <p className="text-[13px] font-semibold text-[#1e7d55]">{`✓ ${groups.done.length} ${groups.done.length === 1 ? 'anuncio creado' : 'anuncios creados'} en Meta Ads, ${statusLabel}`}</p>
                <ul className="mt-3 flex flex-col gap-2">
                  {groups.done.map((row) => row.published && (
                    <li key={row.id} className="flex items-start justify-between gap-3 rounded-md bg-white/70 p-2.5">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <NameLine label="Campaña" value={row.published.campaignName} />
                        <NameLine label="Conjunto" value={row.published.adsetName} />
                        <NameLine label="Anuncio" value={row.published.adName} />
                      </div>
                      <a href={`https://adsmanager.facebook.com/adsmanager/manage/ads?act=${row.published.accountId.replace(/^act_/, '')}&selected_ad_ids=${row.metaAdId}`} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[#1e7d55] hover:underline">
                        Ver en Ads Manager<ExternalLink className="size-3" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {groups.errors.length > 0 && (
              <ul className="flex flex-col gap-2">
                {groups.errors.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#f3cccc] bg-[#fdf6f6] px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><StateBadge state="error" /><span className="truncate font-mono text-[11px] text-[#141414]">{nameOf(row)}</span></div>
                      <p className="mt-1 text-[11px] text-[#c23b3b]">{row.error}</p>
                    </div>
                    <Button size="sm" variant="outline" disabled={retrying.includes(row.id)} onClick={() => retry(row)} className="h-8 shrink-0 rounded-full border-[#dcdcd8] bg-white text-[11px] text-[#333] hover:bg-[#f5f5f3] hover:text-[#141414]">
                      {retrying.includes(row.id) ? 'Reintentando…' : 'Reintentar'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-4">
              <button type="button" onClick={reset} className="text-[12px] font-semibold text-[#5B5FE8] hover:underline">Nueva carga</button>
              {groups.ready.filter((row) => row.status !== 'error').length > 0 && <button type="button" onClick={() => setPublishPhase('idle', 0)} className="text-[12px] font-semibold text-[#333] hover:underline">Publicar los restantes</button>}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="bulk-link" className="text-[11px] font-medium text-[#777]">URL de destino</label>
              <Input id="bulk-link" type="url" value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://sitio-del-cliente.com/landing" className="h-9 max-w-[480px] border-[#dcdcd8] bg-white text-[12px] text-[#141414] placeholder:text-[#aaa] dark:bg-white" />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-medium text-[#777]">Estado al subir</p>
              <div role="radiogroup" aria-label="Estado al subir" className="inline-flex rounded-full border border-[#dcdcd8] bg-[#f5f5f3] p-0.5">
                {([['PAUSED', 'Pausado (recomendado)'], ['ACTIVE', 'Activo']] as const).map(([value, label]) => (
                  <button key={value} type="button" role="radio" aria-checked={initialStatus === value} onClick={() => setInitialStatus(value)} className={cn('rounded-full px-4 py-1.5 text-[11.5px] font-medium', initialStatus === value ? 'bg-white text-[#141414] shadow-sm' : 'text-[#777]')}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-pretty text-[11.5px] leading-relaxed text-[#777]">
                {initialStatus === 'PAUSED' ? 'La campaña, el conjunto y el anuncio se crean pausados: aparecen en Ads Manager, no gastan y se activan con un clic.' : 'Los anuncios empiezan a entregar apenas Meta los apruebe y consumen presupuesto del conjunto.'}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <Button size="sm" variant="outline" onClick={() => setStep(2)} className="h-9 rounded-full border-[#dcdcd8] bg-white px-4 text-[11.5px] text-[#333] hover:bg-[#f5f5f3] hover:text-[#141414]">{'← Volver a configurar'}</Button>
              <Button size="sm" onClick={publish} disabled={!groups.ready.length || !linkValid || missingAdset} className="h-9 rounded-full bg-[#141414] px-5 text-[11.5px] text-white hover:bg-[#333]">
                {`Subir ${groups.ready.length} ${groups.ready.length === 1 ? 'anuncio' : 'anuncios'} a Meta`}
              </Button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  )
}
