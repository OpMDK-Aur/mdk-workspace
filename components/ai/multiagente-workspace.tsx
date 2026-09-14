'use client'

import { useEffect, useState } from 'react'
import { Fraunces } from 'next/font/google'
import { ArrowRight, Check, ChevronDown, Eye, Globe2, Info, Pencil, Plus, Settings2, Sparkles, WandSparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ClientSelector, type AnalyzableClient, type ClientAccount } from './client-selector'
import { SupervisorChat } from './supervisor-chat'
import { ClientContextForm } from './client-context-form'
import { ScoreConfigPanel } from './score-config-panel'
import { ConversationsSidebar, type ConversationSummary } from './conversations-sidebar'
import { PaidMediaBackfillPanel } from './paid-media-backfill-panel'
import type { ClientMemory } from '@/lib/ai/client-memory'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'

// Tipografía distintiva sólo para el título del workspace: un serif editorial
// con eje óptico (opsz) e itálica propia, para diferenciarlo del Geist Sans
// que usa el resto del producto sin sumar una tercera familia global.
const displayFont = Fraunces({ subsets: ['latin'], weight: ['500', '600'], style: ['normal', 'italic'], variable: '--font-display' })

export function MultiagenteWorkspace() {
  const [selectedClient, setSelectedClient] = useState<AnalyzableClient | null>(null)
  const [selectedAccounts, setSelectedAccounts] = useState<ClientAccount[]>([])
  const [memory, setMemory] = useState<ClientMemory | null>(null)
  const [loadingMemory, setLoadingMemory] = useState(false)
  const [active, setActive] = useState(false)
  const [editingMemory, setEditingMemory] = useState(false)
  const [scoreConfig, setScoreConfig] = useState<{ objective: string } | null>(null)

  async function handleSelectConversation(conversation: ConversationSummary) {
    // Mostramos el nombre ya conocido de inmediato; en paralelo traemos el
    // registro completo del cliente (con sus cuentas publicitarias) para que
    // el selector de cliente y el chat queden 100% equivalentes a haberlo
    // elegido desde el combobox. Como hay un único chat por cliente, elegir
    // un chat del sidebar es exactamente lo mismo que elegir su cliente.
    setSelectedClient({ id: conversation.clientId, nombre_del_negocio: conversation.clientName, cuentas_publicitarias: [] })

    const supabase = createClient()
    const { data, error } = await supabase
      .from('clientes')
      .select('id, nombre_del_negocio, meta_ads_account_id, google_ads_customer_id, analytics_property_id, tag_manager_container_id, crm_type, cuentas_publicitarias(id_cuenta, nombre_cuenta, plataforma, activo)')
      .eq('id', conversation.clientId)
      .maybeSingle()

    if (!error && data) {
      setSelectedClient(data as unknown as AnalyzableClient)
    }
  }

  useEffect(() => {
    if (!selectedClient) {
      setMemory(null)
      setScoreConfig(null)
      setActive(false)
      setEditingMemory(false)
      return
    }
    setActive(false)
    setEditingMemory(false)
    setScoreConfig(null)
    setLoadingMemory(true)
    Promise.all([
      fetch(`/api/ai/client-memory?clientId=${encodeURIComponent(selectedClient.id)}`).then((r) => r.json()),
      fetch(`/api/ai/score-config?clientId=${encodeURIComponent(selectedClient.id)}`).then((r) => r.json()),
    ])
      .then(([memoryData, scoreData]) => {
        const loadedMemory = memoryData.memory as ClientMemory | null
        setMemory(loadedMemory)
        // Solo mandamos el objetivo cuando la API devolvió un string válido;
        // si la configuración todavía no existe, el Supervisor usa su
        // objetivo predeterminado.
        setScoreConfig(typeof scoreData?.objective === 'string' ? { objective: scoreData.objective } : null)
        setActive(loadedMemory?.completeness === 'complete')
      })
      .finally(() => setLoadingMemory(false))
    // Depende sólo del id: al elegir un chat desde el sidebar, selectedClient
    // se actualiza dos veces (versión parcial y luego completa con cuentas
    // publicitarias) pero con el mismo id, y no queremos refetchear memoria
    // ni score-config ni parpadear el chat activo por eso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient?.id])

  // Deriva los ids de cuenta seleccionados por plataforma para pasárselos
  // al chat: si el usuario elige una o varias cuentas puntuales en el
  // selector, el agente debe quedar restringido a esas cuentas en vez de
  // analizar todas las activas del cliente.
  const selectedMetaAccountId = selectedAccounts
    .filter((account) => account.plataforma?.toLowerCase() === 'meta' && account.id_cuenta)
    .map((account) => account.id_cuenta as string)
    .join(',') || undefined
  const selectedGoogleCustomerId = selectedAccounts
    .filter((account) => account.plataforma?.toLowerCase() === 'google' && account.id_cuenta)
    .map((account) => account.id_cuenta as string)
    .join(',') || undefined
  const selectedAnalyticsPropertyId = selectedAccounts
    .find((account) => account.plataforma?.toLowerCase() === 'analytics')?.id_cuenta || undefined
  const selectedAccountSummary = selectedAccounts.map((account) => ({
    id: account.id_cuenta,
    name: account.nombre_cuenta || account.id_cuenta || 'Cuenta sin nombre',
    platform: account.plataforma,
  }))
  const selectedAccountReading = selectedAccountSummary.length > 0
    ? `Lectura de contexto: analizá exclusivamente ${selectedAccountSummary.map((account) => `${account.name} (${account.platform === 'meta' ? 'Meta Ads' : account.platform === 'google' ? 'Google Ads' : account.platform === 'analytics' ? 'Google Analytics 4' : account.platform === 'tag_manager' ? 'Tag Manager' : account.platform === 'crm' ? 'CRM' : account.platform || 'plataforma'})`).join(', ')}. No uses datos de otras cuentas.`
    : 'Lectura de contexto: no hay una cuenta publicitaria seleccionada. Pedí al usuario que seleccione una antes de analizar.'

  const integrations = [
    { name: 'Meta Ads', key: 'meta', description: 'Campañas, anuncios y audiencias', color: 'bg-[#1877f2]', connected: Boolean(selectedClient?.meta_ads_account_id) },
    { name: 'Google Ads', key: 'google', description: 'Inversión, keywords y conversiones', color: 'bg-[#4285f4]', connected: Boolean(selectedClient?.google_ads_customer_id) },
    { name: 'Google Analytics', key: 'analytics', description: 'Tráfico y comportamiento web', color: 'bg-[#f9ab00]', connected: Boolean(selectedClient?.analytics_property_id) },
    { name: 'CRM', key: 'crm', description: 'Contactos, ventas y atribución', color: 'bg-[#2dd4bf]', connected: Boolean(selectedClient?.crm_type) },
    { name: 'Tag Manager', key: 'tag_manager', description: 'Etiquetas, eventos y medición', color: 'bg-[#246fdb]', connected: Boolean(selectedClient?.tag_manager_container_id) },
  ]

  return (
    <main className="min-h-screen bg-white text-[#141414] dark:bg-[#141414] dark:text-white">
      <div className="flex min-h-screen">
        <aside className="hidden w-[248px] shrink-0 flex-col border-r border-[#e6e8ee] bg-white px-4 py-5 dark:border-white/10 dark:bg-[#17181c] lg:flex">
          <div className="flex items-center gap-2 px-2">
            <div className="flex size-8 items-center justify-center rounded-[10px] bg-[#ff7f00] text-white"><Sparkles className="size-4" /></div>
            <span className="text-[17px] font-semibold tracking-[-0.02em]">conexa</span>
          </div>
          <nav className="mt-10 flex flex-col gap-1 text-sm">
            <div className="flex items-center gap-3 rounded-xl bg-[#eeefff] px-3 py-2.5 font-medium text-[#ff0049] dark:bg-[#292a50] dark:text-[#b9bbff]"><WandSparkles className="size-4" /> Multiagente</div>
            <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[#7d818d]"><Globe2 className="size-4" /> Conexiones <span className="ml-auto text-xs">{integrations.filter((item) => item.connected).length}/{integrations.length}</span></div>
            <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[#7d818d]"><Settings2 className="size-4" /> Configuración</div>
          </nav>
          <div className="mt-auto rounded-2xl border border-[#e6e8ee] bg-[#fafafd] p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-xs font-semibold">Tu inteligencia conectada</p>
            <p className="mt-1 text-xs leading-5 text-[#8b8f9b]">Conectá una fuente y dejá que el agente aprenda de tus datos.</p>
            <Button size="sm" className="mt-3 w-full rounded-lg bg-[#ff7f00] text-white hover:bg-[#4f53d5]"><Plus className="mr-1 size-3.5" /> Agregar conexión</Button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="flex items-center justify-between border-b border-[#e6e8ee] bg-white/85 px-5 py-4 backdrop-blur dark:border-white/10 dark:bg-[#101114]/85 md:px-8">
            <div><p className="text-xs text-[#9296a3]">Workspace / <span className="text-[#555966] dark:text-[#c8cad1]">Multiagente</span></p><h1 className="mt-1 text-lg font-semibold tracking-[-0.02em]">Conexa</h1></div>
            <div className="flex items-center gap-3"><Button variant="outline" size="sm" className="hidden rounded-lg border-[#e2e4ea] bg-white md:flex"><Plus className="mr-1.5 size-4" /> Agregar plataforma</Button><div className="flex size-8 items-center justify-center rounded-full bg-[#e7e8ff] text-xs font-semibold text-[#ff0049]">MD</div></div>
          </header>

          <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-6 px-5 py-7 md:px-8 md:py-9">
            <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div><p className="text-sm font-medium text-[#ff0049]">Tu espacio de trabajo</p><h2 className="mt-1 text-3xl font-semibold tracking-[-0.04em] md:text-4xl">Todo conectado. Todo aprendido.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#858996]">El multiagente reúne tus plataformas, aprende el contexto de cada cliente y convierte los datos en respuestas accionables.</p></div>
              <Button variant="outline" className="w-fit rounded-xl border-[#dedfe8] bg-white"><ChevronDown className="mr-2 size-4" /> Cliente actual</Button>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Conexiones del cliente">
              {integrations.map((integration) => <div key={integration.key} className="group rounded-2xl border border-[#e4e6ed] bg-white p-4 shadow-[0_2px_10px_rgba(32,34,45,0.03)] transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-[#17181c]"><div className="flex items-start justify-between"><div className={cn('flex size-9 items-center justify-center rounded-xl text-sm font-bold text-white', integration.color)}>{integration.name.slice(0, 1)}</div>{integration.connected ? <span className="flex items-center gap-1 rounded-full bg-[#e9faf3] px-2 py-1 text-[10px] font-semibold text-[#1b9b65]"><Check className="size-3" /> Conectado</span> : <span className="rounded-full bg-[#f2f3f6] px-2 py-1 text-[10px] font-semibold text-[#858996]">Pendiente</span>}</div><p className="mt-4 text-sm font-semibold">{integration.name}</p><p className="mt-1 text-xs text-[#9094a1]">{integration.description}</p><button type="button" className="mt-4 flex items-center gap-1 text-xs font-medium text-[#5b5fe8]">{integration.connected ? 'Administrar' : 'Conectar'} <ArrowRight className="size-3.5" /></button></div>)}
            </section>

            <div className="flex flex-col gap-6 xl:flex-row">
              <ConversationsSidebar activeClientId={selectedClient?.id ?? null} onSelect={handleSelectConversation} />

              <div className="flex min-w-0 flex-1 flex-col gap-6">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium text-foreground">Cliente a analizar</span>
                {selectedClient && memory && !loadingMemory && !editingMemory && (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingMemory(true)}
                      className="gap-1.5 border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary"
                    >
                      <Eye className="size-4" aria-hidden="true" />
                      Ver memoria
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                          aria-label="Qué muestra Ver memoria"
                        >
                          <Info className="size-4" aria-hidden="true" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-64 text-pretty">
                        Abre el contexto guardado del cliente: industria, objetivo comercial, qué vende y su conversión principal. Desde ahí también podés editarlo.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                )}
              </div>
              <ClientSelector value={selectedClient} onChange={setSelectedClient} onAccountsChange={setSelectedAccounts} />
            </div>
            {selectedClient && selectedAccounts.length > 0 && (
              <section className="flex flex-col gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4" aria-label="Cuentas incluidas en el análisis">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">El análisis está limitado a:</p>
                  <span className="font-mono text-[11px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Filtro activo</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedAccounts.map((account) => (
                    <span key={`${account.plataforma}-${account.id_cuenta}`} className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-foreground">
                      <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
                      <span className="font-medium">{account.nombre_cuenta || account.id_cuenta || 'Cuenta sin nombre'}</span>
                      <span className="text-emerald-700 dark:text-emerald-300">({account.plataforma === 'meta' ? 'Meta Ads' : account.plataforma === 'google' ? 'Google Ads' : account.plataforma || 'Plataforma'})</span>
                    </span>
                  ))}
                </div>
              </section>
            )}
            {selectedClient && <ScoreConfigPanel clientId={selectedClient.id} onSaved={setScoreConfig} />}
            {selectedClient && <PaidMediaBackfillPanel clientId={selectedClient.id} clientName={selectedClient.nombre_del_negocio} />}

            {selectedClient && loadingMemory && <div className="flex flex-col gap-4"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>}
            {selectedClient && !loadingMemory && editingMemory && <ClientContextForm clientId={selectedClient.id} clientName={selectedClient.nombre_del_negocio} initialMemory={memory} mode="edit" onCancel={() => setEditingMemory(false)} onCompleted={(updated) => { setMemory(updated); setEditingMemory(false); setActive(true); toast.success('Memoria del cliente actualizada.') }} />}
            {selectedClient && !loadingMemory && !active && <ClientContextForm clientId={selectedClient.id} clientName={selectedClient.nombre_del_negocio} initialMemory={memory} onCompleted={(updated) => { setMemory(updated); setActive(true) }} />}
            {active && (
              <SupervisorChat
                key={`${selectedClient?.id ?? 'no-client'}:${selectedMetaAccountId ?? 'all-meta'}:${selectedGoogleCustomerId ?? 'all-google'}`}
                clientId={selectedClient?.id ?? null}
                metaAccountId={selectedMetaAccountId}
                googleCustomerId={selectedGoogleCustomerId}
                analyticsPropertyId={selectedAnalyticsPropertyId}
                selectedAccountSummary={selectedAccountSummary}
                selectedAccountReading={selectedAccountReading}
                disabled={!selectedClient}
                disabledMessage="Seleccioná un cliente para comenzar el análisis."
                scoreConfig={scoreConfig ?? undefined}
                title="Análisis del cliente"
                description="El Multiagente consulta el contexto de la cuenta y responde con datos reales."
              />
            )}
          </div>
        </div>
      </div>
        </div>
      </div>
    </main>
  )
}

function MemorySummaryLegacy({ memory, onEdit }: { memory: ClientMemory; onEdit: () => void }) {
  const rows = [['Industria', memory.profile.industry], ['Objetivo comercial', memory.profile.commercial_objective], ['Qué ofrece', memory.profile.product_type], ['Conversión principal', memory.profile.primary_conversion_type]]
  return <section className="mx-auto flex w-full max-w-2xl flex-col gap-5 rounded-lg border bg-card p-5" aria-labelledby="memory-summary-title">
    <div className="flex items-start justify-between gap-4"><div><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Memoria del cliente</p><h2 id="memory-summary-title" className="mt-1 text-xl font-semibold">Contexto listo para analizar</h2></div><Button variant="outline" size="sm" onClick={onEdit}><Pencil className="mr-2 size-4" aria-hidden="true" />Actualizar memoria</Button></div>
    <dl className="grid gap-3 text-sm sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="flex flex-col gap-1"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value || 'No definido'}</dd></div>)}</dl>
  </section>
}
