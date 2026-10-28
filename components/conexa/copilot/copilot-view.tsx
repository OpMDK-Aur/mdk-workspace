'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { PLATFORM_LABEL, type CopilotPlatform, type Recommendation } from '@/lib/conexa/copilot/types'
import { DashboardTab } from './dashboard-tab'
import { HistoryTab } from './history-tab'
import { InboxView } from './inbox-view'
import { PlanView } from './plan-view'
import { ScheduledTab } from './scheduled-tab'
import { useCopilot } from './use-copilot'

type Layout = 'inbox' | 'plan'
const LAYOUT_KEY = 'conexa-copilot-layout'
const layoutListeners = new Set<() => void>()

/** Preferencia de vista por usuario: es solo UI, por eso vive en el navegador. */
function useLayoutPreference() {
  const layout = useSyncExternalStore(
    (listener) => { layoutListeners.add(listener); return () => layoutListeners.delete(listener) },
    () => (localStorage.getItem(LAYOUT_KEY) === 'plan' ? 'plan' : 'inbox') as Layout,
    () => 'inbox' as Layout,
  )
  const setLayout = (value: Layout) => { localStorage.setItem(LAYOUT_KEY, value); layoutListeners.forEach((listener) => listener()) }
  return [layout, setLayout] as const
}

const FILTERS: { key: CopilotPlatform | 'all'; label: string }[] = [{ key: 'all', label: 'Todas' }, ...(Object.keys(PLATFORM_LABEL) as CopilotPlatform[]).map((key) => ({ key, label: PLATFORM_LABEL[key] }))]

export function CopilotView({ client }: { client: { id: string } | null }) {
  if (!client) return <div className="flex h-full items-center justify-center p-6 text-[13px] text-[#737373]">Elegí un cliente para ver las acciones del Copiloto.</div>
  return <CopilotContent key={client.id} clientId={client.id} />
}

function CopilotContent({ clientId }: { clientId: string }) {
  const copilot = useCopilot(clientId)
  const [layout, setLayout] = useLayoutPreference()
  const [tab, setTab] = useState('suggested')
  const [filter, setFilter] = useState<CopilotPlatform | 'all'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { recommendations, plays, context } = copilot
  const pending = useMemo(() => recommendations.filter((item) => item.status === 'pending' && (filter === 'all' || item.platform === filter)), [recommendations, filter])
  const scheduled = recommendations.filter((item) => item.status === 'scheduled')
  const playOf = (rec: Recommendation) => plays.find((play) => play.id === rec.playId)
  const selected = recommendations.find((item) => item.id === selectedId) ?? pending[0]

  return (
    <div className="mx-auto h-full max-w-[1180px] overflow-y-auto px-6 py-5">
      <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="max-w-[680px]">
          <h1 className="text-[20px] font-bold text-[#202020]"><span aria-hidden className="text-[#5b5fe8]">{'✦ '}</span>Copiloto</h1>
          <p className="mt-1 text-pretty text-[13px] leading-relaxed text-[#737373]">Conexa cruza el contexto del negocio, los objetivos del cliente, el historial de decisiones y la performance del período para proponerte acciones. Vos aprobás, Conexa ejecuta y mide el resultado.</p>
        </div>
        <div role="radiogroup" aria-label="Vista" className="flex shrink-0 gap-1 rounded-lg bg-[#f5f5f4] p-1">
          {([['inbox', 'A · Bandeja'], ['plan', 'B · Plan del día']] as const).map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={layout === value} onClick={() => setLayout(value)} className={cn('rounded-md px-3 py-1.5 text-[12.5px] font-medium', layout === value ? 'bg-white text-[#202020] shadow-sm' : 'text-[#737373]')}>{label}</button>
          ))}
        </div>
      </header>

      <ul className="mb-4 flex flex-wrap gap-2" aria-label="Contexto">
        <ContextChip label="Objetivo" value={context?.objective ?? 'Ventas sobre volumen de leads'} />
        <ContextChip label="Historial" value={`${context?.decisionsCount ?? copilot.decisions.length} decisiones registradas`} />
        <ContextChip label="Datos" value={(context?.sources ?? ['Meta', 'Google Ads', 'GA4', 'CRM', 'GTM']).join(' · ')} />
      </ul>

      {copilot.error ? <p role="alert" className="rounded-lg bg-[#fef2f2] px-4 py-3 text-[13px] text-[#b91c1c]">{copilot.error.message}</p> : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="suggested">Sugeridas ({recommendations.filter((item) => item.status === 'pending').length})</TabsTrigger>
            <TabsTrigger value="scheduled">Programadas ({scheduled.length})</TabsTrigger>
            <TabsTrigger value="history">Historial y aprendizajes</TabsTrigger>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          </TabsList>

          <TabsContent value="suggested" className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por plataforma">
              {FILTERS.map((item) => (
                <button key={item.key} type="button" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)} className={cn('rounded-full border px-3 py-1 text-[12.5px]', filter === item.key ? 'border-[#202020] bg-[#202020] text-white' : 'border-[#dededb] bg-white text-[#404040] hover:border-[#a3a3a3]')}>{item.label}</button>
              ))}
            </div>
            {copilot.isLoading ? <p className="py-10 text-center text-[13px] text-[#737373]">Cargando acciones…</p> : layout === 'inbox' ? (
              <InboxView items={pending} selected={selected} onSelect={setSelectedId} playOf={playOf} copilot={copilot} onGoHistory={() => setTab('history')} onGoScheduled={() => setTab('scheduled')} />
            ) : (
              <PlanView items={pending} all={recommendations} playOf={playOf} copilot={copilot} onGoHistory={() => setTab('history')} onGoScheduled={() => setTab('scheduled')} />
            )}
          </TabsContent>
          <TabsContent value="scheduled"><ScheduledTab items={scheduled} copilot={copilot} /></TabsContent>
          <TabsContent value="history"><HistoryTab copilot={copilot} /></TabsContent>
          <TabsContent value="dashboard"><DashboardTab clientId={clientId} /></TabsContent>
        </Tabs>
      )}
    </div>
  )
}

function ContextChip({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center gap-1.5 rounded-full border border-[#e8e8e5] bg-white px-3 py-1 text-[12px]">
      <span className="font-semibold text-[#525252]">{label}:</span><span className="text-[#737373]">{value}</span>
    </li>
  )
}
