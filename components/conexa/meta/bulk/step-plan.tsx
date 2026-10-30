'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBulkStore } from '@/lib/bulk/store'
import { savePlanOverridesRequest } from '@/lib/conexa/bulk/client'
import { planToRows, actingAds } from '@/lib/conexa/bulk/plan-rows'
import { resolvePlan } from '@/lib/conexa/bulk/resolve'
import { ACTION_LABELS, CANONICAL_ACTIONS, type CanonicalAction, type ItemState, type PlanBadge, type PlanOverrides } from '@/lib/conexa/bulk/types'
import { Button } from '@/components/ui/button'

const selectClass = 'rounded-md border border-[#e5e5e0] bg-white px-2 py-1 text-[11.5px] text-[#141414] outline-none focus:border-[#5B5FE8]'

const BADGE_CLASS: Record<PlanBadge, string> = {
  'Crear campaña': 'bg-[#5B5FE8]/10 text-[#4347c9]',
  'Crear conjunto': 'bg-[#5B5FE8]/10 text-[#4347c9]',
  'Crear anuncio': 'bg-[#e8f6ef] text-[#147a52]',
  'Usar existente': 'bg-[#f0f0ed] text-[#555]',
  'Nuevo (reemplaza creativos)': 'bg-[#fdf3e3] text-[#8a5f0d]',
  'Nuevo (formatos faltantes)': 'bg-[#fdf3e3] text-[#8a5f0d]',
  'Sin cambios': 'bg-[#f0f0ed] text-[#999]',
}

function StateIcon({ state }: { state: ItemState }) {
  if (state === 'ready') return <CheckCircle2 className="size-3.5 shrink-0 text-[#1e9e6b]" aria-label="Listo" />
  return <AlertTriangle className={cn('size-3.5 shrink-0', state === 'blocked' ? 'text-[#c0432c]' : 'text-[#c98a16]')} aria-label={state === 'blocked' ? 'Bloqueado' : 'Requiere confirmación'} />
}

function Badge({ label }: { label: string }) {
  return <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold', BADGE_CLASS[label as PlanBadge] ?? 'bg-[#f0f0ed] text-[#555]')}>{label}</span>
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#ececea] bg-white">
      <header className="flex items-center justify-between border-b border-[#f0f0ed] px-4 py-2.5">
        <h3 className="text-[12.5px] font-semibold text-[#141414]">{title}</h3>
        <span className="text-[11px] text-[#999]">{count}</span>
      </header>
      <ul className="divide-y divide-[#f3f3f0]">{children}</ul>
    </section>
  )
}

export function StepPlan() {
  const sheetPlan = useBulkStore((state) => state.sheetPlan)
  const clientId = useBulkStore((state) => state.clientId)
  const setPlanOverrides = useBulkStore((state) => state.setPlanOverrides)
  const setPlanRows = useBulkStore((state) => state.setPlanRows)
  const exitSheetPlan = useBulkStore((state) => state.exitSheetPlan)
  const [saving, setSaving] = useState(false)
  const [saveWarning, setSaveWarning] = useState<string | null>(null)
  const [aliases, setAliases] = useState<Array<{ alias: string; accountId: string }>>([])

  const plan = useMemo(() => (sheetPlan ? resolvePlan(sheetPlan.context, sheetPlan.overrides) : null), [sheetPlan])
  if (!sheetPlan || !plan) return null
  const { context, overrides } = sheetPlan
  const accountName = (id?: string) => context.inventory.accounts.find((account) => account.id === id)?.name ?? id ?? '—'

  const update = (patch: Partial<PlanOverrides>) => setPlanOverrides({ ...overrides, ...patch })
  const toggleRow = (rowNumber: number) => {
    const current = new Set(overrides.excludedRows ?? [])
    if (current.has(rowNumber)) current.delete(rowNumber)
    else current.add(rowNumber)
    update({ excludedRows: [...current] })
  }
  const setAccount = (rowNumber: number, accountId: string) => {
    update({ accountByRow: { ...overrides.accountByRow, [rowNumber]: accountId } })
    const accountCell = context.interpretation.columns.findIndex((column) => column.role === 'account')
    const alias = accountCell >= 0 ? context.grid.rows.find((row) => row.rowNumber === rowNumber)?.cells[context.grid.headers.indexOf(context.interpretation.columns[accountCell].header)]?.trim() : undefined
    if (alias && accountId) setAliases((current) => [...current.filter((item) => item.alias !== alias), { alias, accountId }])
  }
  const setField = (key: string, patch: NonNullable<PlanOverrides['fields']>[string]) => update({ fields: { ...overrides.fields, [key]: { ...overrides.fields?.[key], ...patch } } })

  const visibleRows = plan.rows.filter((row) => !row.filteredOut)
  const activeRows = new Set(visibleRows.filter((row) => !row.excluded).map((row) => row.rowNumber))
  const campaigns = plan.campaigns.filter((campaign) => campaign.rows.some((row) => activeRows.has(row)))
  const adsets = plan.adsets.filter((adset) => adset.rows.some((row) => activeRows.has(row)))
  const ads = plan.ads.filter((ad) => activeRows.has(ad.rowNumber))
  const acting = actingAds(plan)
  const blockers = [
    ...visibleRows.filter((row) => !row.excluded && row.state !== 'ready').flatMap((row) => row.issues),
    ...campaigns.filter((item) => item.state !== 'ready').flatMap((item) => item.issues),
    ...adsets.filter((item) => item.state !== 'ready').flatMap((item) => item.issues),
    ...acting.filter((item) => item.state !== 'ready').flatMap((item) => item.issues),
  ]

  async function continueToConfigure() {
    if (!plan || !clientId) return
    setSaving(true)
    setSaveWarning(null)
    try {
      if (aliases.length) for (const alias of aliases) await savePlanOverridesRequest(context.planId, { clientId, overrides, alias })
      else await savePlanOverridesRequest(context.planId, { clientId, overrides })
    } catch (cause) {
      setSaveWarning(cause instanceof Error ? `No se guardaron las decisiones: ${cause.message}` : 'No se guardaron las decisiones.')
    } finally {
      setSaving(false)
    }
    setPlanRows(planToRows(plan))
  }

  const { summary } = plan
  const stats = [
    { label: 'Filas leídas', value: summary.read },
    { label: 'A procesar', value: summary.processed },
    { label: 'Campañas nuevas', value: summary.newCampaigns },
    { label: 'Conjuntos nuevos', value: summary.newAdsets },
    { label: 'Anuncios nuevos', value: summary.newAds },
    { label: 'Sin cambios', value: summary.unchanged },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#ececea] bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-[#999]">Plan de carga</p>
          <h2 className="truncate text-[15px] font-semibold text-[#141414]">{`${context.grid.title} · ${context.sheetTitle}`}</h2>
          {context.rowFilter && <p className="text-[11.5px] text-[#777]">{`Solo filas con ${context.rowFilter.column}: ${context.rowFilter.values.join(', ')} · ${summary.filtered} filtradas`}</p>}
        </div>
        <button type="button" onClick={exitSheetPlan} className="inline-flex items-center gap-1 text-[11.5px] text-[#777] hover:text-[#141414]">
          <X className="size-3.5" aria-hidden="true" />
          Descartar plan
        </button>
        <dl className="flex w-full flex-wrap gap-x-6 gap-y-2 border-t border-[#f0f0ed] pt-3">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col">
              <dt className="text-[10.5px] text-[#999]">{stat.label}</dt>
              <dd className="font-mono text-[16px] font-semibold text-[#141414]">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {context.warnings.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-[#f0e2c2] bg-[#fdf8ec] px-3 py-2 text-[11.5px] text-[#8a5f0d]">
          {context.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}

      <Section title="Filas del sheet" count={visibleRows.length}>
        {visibleRows.map((row) => (
          <li key={row.rowNumber} className={cn('flex flex-wrap items-center gap-3 px-4 py-2', row.excluded && 'opacity-50')}>
            <input type="checkbox" checked={!row.excluded} onChange={() => toggleRow(row.rowNumber)} aria-label={`Incluir fila ${row.rowNumber}`} className="accent-[#5B5FE8]" />
            <span className="w-10 font-mono text-[11px] text-[#999]">{`#${row.rowNumber}`}</span>
            {!row.excluded && <StateIcon state={row.state} />}
            <div className="flex min-w-[180px] flex-1 flex-col">
              {row.accountStatus === 'resolved' ? (
                <span className="text-[12px] text-[#141414]">{accountName(row.accountId)}</span>
              ) : (
                <label className="flex items-center gap-2 text-[11.5px] text-[#8a5f0d]">
                  Cuenta
                  <select value={overrides.accountByRow?.[row.rowNumber] ?? ''} onChange={(event) => setAccount(row.rowNumber, event.target.value)} className={selectClass}>
                    <option value="">Elegir cuenta…</option>
                    {(row.accountCandidates.length ? row.accountCandidates : context.inventory.accounts).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                  </select>
                </label>
              )}
              <span className="text-[10.5px] text-[#999]">{row.driveError ?? row.actionWarning ?? row.accountReason}</span>
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-[#777]">
              <span className="sr-only">{`Acción fila ${row.rowNumber}`}</span>
              <select value={row.action} onChange={(event) => update({ actionByRow: { ...overrides.actionByRow, [row.rowNumber]: event.target.value as CanonicalAction } })} className={selectClass}>
                {CANONICAL_ACTIONS.filter((action) => action !== 'unknown' || row.action === 'unknown').map((action) => <option key={action} value={action}>{ACTION_LABELS[action]}</option>)}
              </select>
              {row.actionSource === 'inferred' && <span>inferida</span>}
            </label>
          </li>
        ))}
      </Section>

      <Section title="Campañas" count={campaigns.length}>
        {campaigns.map((campaign) => (
          <li key={campaign.key} className="flex flex-col gap-2 px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <StateIcon state={campaign.state} />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[#141414]">{campaign.name}</span>
              <Badge label={campaign.mode === 'existing' ? 'Usar existente' : 'Crear campaña'} />
            </div>
            <p className="text-[11px] text-[#777]">{`${accountName(campaign.accountId)} · ${campaign.reason}`}</p>
            <div className="flex flex-wrap items-center gap-2">
              {campaign.candidates.length > 0 && (
                <select aria-label={`Decisión para ${campaign.name}`} value={overrides.campaignDecision?.[campaign.key] ?? (campaign.mode === 'existing' ? campaign.existingId ?? 'use_existing' : 'create')} onChange={(event) => update({ campaignDecision: { ...overrides.campaignDecision, [campaign.key]: event.target.value } })} className={selectClass}>
                  {campaign.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{`Usar: ${candidate.name}`}</option>)}
                  <option value="create">Crear nueva</option>
                </select>
              )}
              {campaign.mode === 'create' && (
                <>
                  <select aria-label="Campaña de referencia" value={campaign.reference?.id ?? ''} onChange={(event) => setField(campaign.key, { referenceCampaignId: event.target.value })} className={selectClass}>
                    <option value="">Copiar configuración de…</option>
                    {context.inventory.campaigns.filter((item) => item.accountId === campaign.accountId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  {campaign.isCbo && (
                    <label className="flex items-center gap-1 text-[11px] text-[#777]">
                      Diario
                      <input type="number" min={1} value={campaign.dailyBudget ?? ''} onChange={(event) => setField(campaign.key, { dailyBudget: Number(event.target.value) || undefined })} className={cn(selectClass, 'w-24')} />
                    </label>
                  )}
                </>
              )}
            </div>
            {campaign.issues.map((issue) => <p key={issue.field + issue.message} className="text-[11px] text-[#c0432c]">{issue.message}</p>)}
          </li>
        ))}
      </Section>

      <Section title="Conjuntos" count={adsets.length}>
        {adsets.map((adset) => (
          <li key={adset.key} className="flex flex-col gap-2 px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <StateIcon state={adset.state} />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[#141414]">{adset.name}</span>
              <Badge label={adset.mode === 'existing' ? 'Usar existente' : 'Crear conjunto'} />
            </div>
            <p className="text-[11px] text-[#777]">{adset.reason}</p>
            <div className="flex flex-wrap items-center gap-2">
              {adset.options.length > 1 && (
                <fieldset className="flex flex-wrap gap-1.5">
                  <legend className="sr-only">{`Conjuntos para ${adset.name}`}</legend>
                  {adset.options.map((option) => {
                    const checked = adset.existingIds.includes(option.id)
                    const next = checked ? adset.existingIds.filter((id) => id !== option.id) : [...adset.existingIds, option.id]
                    return (
                      <button key={option.id} type="button" aria-pressed={checked} onClick={() => update({ adsetChoice: { ...overrides.adsetChoice, [adset.key]: next } })} className={cn('rounded-full border px-2.5 py-0.5 text-[11px]', checked ? 'border-[#5B5FE8] bg-[#5B5FE8]/10 text-[#4347c9]' : 'border-[#e5e5e0] text-[#555]')}>
                        {`${option.name} · ${option.status === 'ACTIVE' ? 'activo' : 'pausado'}`}
                      </button>
                    )
                  })}
                </fieldset>
              )}
              {adset.mode === 'create' && (
                <>
                  <select aria-label="Conjunto de referencia" value={adset.reference?.id ?? ''} onChange={(event) => setField(adset.key, { referenceAdsetId: event.target.value })} className={selectClass}>
                    <option value="">Copiar segmentación de…</option>
                    {context.inventory.adsets.filter((item) => item.accountId === adset.accountId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-[11px] text-[#777]">
                    Diario
                    <input type="number" min={1} value={adset.dailyBudget ?? ''} onChange={(event) => setField(adset.key, { dailyBudget: Number(event.target.value) || undefined })} className={cn(selectClass, 'w-24')} />
                  </label>
                </>
              )}
            </div>
            {adset.issues.map((issue) => <p key={issue.field + issue.message} className="text-[11px] text-[#c0432c]">{issue.message}</p>)}
          </li>
        ))}
      </Section>

      <Section title="Anuncios" count={ads.length}>
        {ads.map((ad) => (
          <li key={ad.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-2.5', ad.badge === 'Sin cambios' && 'opacity-60')}>
            <StateIcon state={ad.state} />
            <div className="flex min-w-[200px] flex-1 flex-col">
              <span className="truncate text-[12.5px] font-medium text-[#141414]">{ad.name}</span>
              <span className="text-[11px] text-[#777]">{`Fila ${ad.rowNumber} · ${ad.piece} · ${ad.formats.join(', ') || 'sin formatos'}`}</span>
              <span className="text-[10.5px] text-[#999]">{ad.reason}</span>
            </div>
            {ad.match && !ad.match.certain && (
              <div className="flex items-center gap-1.5 text-[11px] text-[#8a5f0d]">
                {`¿Es "${ad.match.name}"?`}
                <button type="button" onClick={() => update({ pieceMatch: { ...overrides.pieceMatch, [ad.id]: 'confirm' } })} className="rounded-full border border-[#e5e5e0] px-2 py-0.5 hover:border-[#141414]">Sí</button>
                <button type="button" onClick={() => update({ pieceMatch: { ...overrides.pieceMatch, [ad.id]: 'reject' } })} className="rounded-full border border-[#e5e5e0] px-2 py-0.5 hover:border-[#141414]">No</button>
              </div>
            )}
            {ad.aiCopy && <span className="text-[10.5px] text-[#5B5FE8]">Copy IA</span>}
            <Badge label={ad.badge} />
          </li>
        ))}
        {!ads.length && <li className="px-4 py-6 text-center text-[12px] text-[#999]">No hay anuncios para crear con las filas incluidas.</li>}
      </Section>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ececea] bg-white px-4 py-3">
        <p className={cn('text-[11.5px]', blockers.length ? 'text-[#c0432c]' : 'text-[#777]')} role="status">
          {saveWarning ?? (blockers.length ? `${blockers.length} puntos por resolver antes de seguir: ${blockers[0].message}` : `${acting.length} anuncios listos. Nada se crea en Meta hasta que apruebes en el último paso.`)}
        </p>
        <Button size="sm" disabled={Boolean(blockers.length) || !acting.length || saving} onClick={continueToConfigure} className="h-9 rounded-full bg-[#141414] px-5 text-[11.5px] text-white hover:bg-[#333]">
          {saving && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          {'Configurar anuncios →'}
        </Button>
      </div>
    </div>
  )
}
