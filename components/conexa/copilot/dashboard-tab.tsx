'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { copilotFetcher, copilotUrls } from '@/lib/conexa/copilot/api'
import { PLATFORM_LABEL, type CopilotPlatform, type DashboardRange, type DashboardResponse } from '@/lib/conexa/copilot/types'
import { EmptyState, ResultBadge, platformLabel } from './shared'

const ALL = 'all'
const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()

export function DashboardTab({ clientId }: { clientId: string }) {
  const [type, setType] = useState(ALL)
  const [platform, setPlatform] = useState(ALL)
  const [range, setRange] = useState<DashboardRange>('30')
  const [by, setBy] = useState(ALL)
  const query: Record<string, string> = { range }
  if (type !== ALL) query.type = type
  if (platform !== ALL) query.platform = platform
  if (by !== ALL) query.by = by
  const { data, isLoading } = useSWR<DashboardResponse>(copilotUrls.dashboard(clientId, query), copilotFetcher, { keepPreviousData: true, revalidateOnFocus: false })

  const kpis = data?.kpis
  const maxPlatform = Math.max(1, ...(data?.byPlatform.map((item) => item.count) ?? [1]))
  const maxType = Math.max(1, ...(data?.byType.map((item) => item.count) ?? [1]))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtros del dashboard">
        <FilterSelect label="Tipo de acción" value={type} onChange={setType} options={(data?.options.types ?? []).map((item) => ({ value: item, label: item }))} allLabel="Todos los tipos" />
        <FilterSelect label="Plataforma" value={platform} onChange={setPlatform} options={(Object.keys(PLATFORM_LABEL) as CopilotPlatform[]).map((key) => ({ value: key, label: PLATFORM_LABEL[key] }))} allLabel="Todas las plataformas" />
        <div role="radiogroup" aria-label="Fecha de ejecución" className="flex gap-1 rounded-lg bg-[#f5f5f4] p-1">
          {(['7', '30', '90'] as DashboardRange[]).map((value) => (
            <button key={value} type="button" role="radio" aria-checked={range === value} onClick={() => setRange(value)} className={range === value ? 'rounded-md bg-white px-2.5 py-1 text-[12px] font-medium text-[#202020] shadow-sm' : 'rounded-md px-2.5 py-1 text-[12px] text-[#737373]'}>{value} días</button>
          ))}
        </div>
        <FilterSelect label="Persona" value={by} onChange={setBy} options={(data?.options.people ?? []).map((item) => ({ value: item, label: item }))} allLabel="Todas las personas" />
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Acciones ejecutadas', kpis?.executed],
          ['Tasa de éxito', kpis ? `${kpis.successRate}%` : undefined],
          ['Rechazadas', kpis?.rejected],
          ['Midiendo', kpis?.measuring],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-xl border border-[#e8e8e5] bg-white p-4">
            <dt className="text-[11.5px] text-[#737373]">{label}</dt>
            <dd className="mt-1 text-[22px] font-bold tabular-nums text-[#202020]">{isLoading && value === undefined ? '…' : value ?? 0}</dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Bars title="Por plataforma" rows={(data?.byPlatform ?? []).map((item) => ({ label: platformLabel(item.key), count: item.count }))} max={maxPlatform} />
        <Bars title="Por tipo" rows={(data?.byType ?? []).map((item) => ({ label: item.key, count: item.count }))} max={maxType} />
      </div>

      <section aria-labelledby="copilot-executions" className="flex flex-col gap-2">
        <h3 id="copilot-executions" className="text-[12px] font-semibold uppercase tracking-wide text-[#525252]">Ejecuciones</h3>
        {data && !data.rows.length ? <EmptyState>No hay ejecuciones para estos filtros.</EmptyState> : (
          <div className="overflow-x-auto rounded-xl border border-[#e8e8e5] bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead><TableHead>Persona</TableHead><TableHead>Plataforma</TableHead><TableHead>Acción</TableHead><TableHead>Decisión</TableHead><TableHead>Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.rows ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-[12.5px]">{row.date}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2 text-[12.5px]">
                        <Avatar className="size-6"><AvatarFallback className="text-[10px]">{initials(row.by)}</AvatarFallback></Avatar>{row.by}
                      </span>
                    </TableCell>
                    <TableCell className="text-[12.5px]">{row.platform ? platformLabel(row.platform) : '—'}</TableCell>
                    <TableCell className="max-w-[280px] truncate text-[12.5px] font-medium">{row.title ?? row.recommended}</TableCell>
                    <TableCell className="text-[12.5px]">{row.decision}</TableCell>
                    <TableCell><ResultBadge result={row.result} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}

function FilterSelect({ label, value, onChange, options, allLabel }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; allLabel: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="h-8 w-auto min-w-[160px] text-[12.5px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function Bars({ title, rows, max }: { title: string; rows: { label: string; count: number }[]; max: number }) {
  return (
    <section className="rounded-xl border border-[#e8e8e5] bg-white p-4">
      <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[#525252]">{title}</h3>
      {!rows.length ? <p className="text-[12.5px] text-[#a3a3a3]">Sin datos</p> : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.label} className="grid grid-cols-[110px_1fr_28px] items-center gap-2 text-[12px]">
              <span className="truncate text-[#404040]">{row.label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-[#f0f0ee]"><span className="block h-full rounded-full bg-[#202020]" style={{ width: `${(row.count / max) * 100}%` }} /></span>
              <span className="text-right tabular-nums text-[#737373]">{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
