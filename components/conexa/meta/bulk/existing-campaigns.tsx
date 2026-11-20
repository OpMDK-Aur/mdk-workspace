'use client'

import { useMemo, useState } from 'react'
import { Check, FileText, Link2, MessageCircle, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBulkStore } from '@/lib/bulk/store'
import { adsetDestinationInfo, adsetStatusLabel, groupAdsetsByCampaign, isAdsetActive, isNewDestinationId, objectiveLabel, type AdsetDestinationInfo, type BulkAdset } from '@/lib/bulk/types'
import { Panel } from './bulk-shared'

const DESTINATION_ICONS = { whatsapp: MessageCircle, form: FileText, link: Link2, none: Link2 } as const

function DestinationLine({ info }: { info: AdsetDestinationInfo }) {
  const Icon = DESTINATION_ICONS[info.kind]
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="shrink-0 text-muted-foreground">{`${info.label}:`}</span>
      <span className={cn('truncate', info.kind === 'none' && 'text-muted-foreground')} title={info.value}>{info.value}</span>
    </span>
  )
}

export function ExistingCampaigns({ adsets }: { adsets: BulkAdset[] }) {
  const [query, setQuery] = useState('')
  const [onlyActive, setOnlyActive] = useState(true)
  const selectedId = useBulkStore((state) => state.defaults.adsetId)
  const setDefaults = useBulkStore((state) => state.setDefaults)
  const rows = useBulkStore((state) => state.rows)
  const updateRows = useBulkStore((state) => state.updateRows)

  const groups = useMemo(() => {
    const term = query.trim().toLowerCase()
    const existing = adsets.filter((adset) => !isNewDestinationId(adset.id))
      .filter((adset) => !onlyActive || isAdsetActive(adset.status))
      .filter((adset) => !term || `${adset.campaignName} ${adset.name}`.toLowerCase().includes(term))
    return groupAdsetsByCampaign(existing)
  }, [adsets, query, onlyActive])

  function choose(adsetId: string) {
    const next = selectedId === adsetId ? '' : adsetId
    setDefaults({ adsetId: next })
    const unassigned = rows.filter((row) => !row.adsetId).map((row) => row.id)
    if (next && unassigned.length) updateRows(unassigned, { adsetId: next })
  }

  return (
    <Panel title="Cargar en una campaña existente">
      <div className="flex flex-col gap-3">
        <p className="text-pretty text-[11.5px] leading-relaxed text-muted-foreground">
          Elegí el conjunto donde van los archivos que subas. Si no elegís ninguno, podés asignarlo o crear uno nuevo en el paso siguiente.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Buscar campaña o conjunto</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar campaña o conjunto" className="h-8 w-full rounded-md border border-border bg-card pl-8 pr-2 text-[12px] text-foreground outline-none focus:border-primary" />
          </label>
          <label className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <input type="checkbox" checked={onlyActive} onChange={(event) => setOnlyActive(event.target.checked)} className="accent-primary" />
            Solo activas
          </label>
        </div>

        {groups.length === 0 ? (
          <p className="rounded-md bg-muted px-3 py-4 text-center text-[11.5px] text-muted-foreground">
            {adsets.length ? 'No hay campañas que coincidan con el filtro.' : 'No hay campañas cargadas para esta cuenta.'}
          </p>
        ) : (
          <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
            {groups.map((group) => {
              const objective = group.adsets[0]?.objective
              return (
                <li key={group.key} className="rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                    <span className="truncate text-[12px] font-semibold text-foreground" title={group.campaignName}>{group.campaignName}</span>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-medium text-primary">{objectiveLabel(objective)}</span>
                  </div>
                  <ul className="flex flex-col">
                    {group.adsets.map((adset) => {
                      const selected = selectedId === adset.id
                      return (
                        <li key={adset.id}>
                          <button
                            type="button"
                            onClick={() => choose(adset.id)}
                            aria-pressed={selected}
                            className={cn('flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors', selected ? 'bg-primary/5' : 'hover:bg-muted')}
                          >
                            <span className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}>
                              {selected && <Check className="size-3" aria-hidden="true" />}
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="flex items-center gap-2">
                                <span className="truncate text-[12px] text-foreground" title={adset.name}>{adset.name}</span>
                                <span className={cn('shrink-0 text-[10px]', isAdsetActive(adset.status) ? 'text-status-verde' : 'text-muted-foreground')}>{adsetStatusLabel(adset.status)}</span>
                              </span>
                              <DestinationLine info={adsetDestinationInfo(adset)} />
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Panel>
  )
}
