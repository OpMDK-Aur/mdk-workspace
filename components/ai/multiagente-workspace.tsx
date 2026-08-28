'use client'

import { useEffect, useState } from 'react'
import { Fraunces } from 'next/font/google'
import { Eye, Info, Pencil, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ClientSelector, type AnalyzableClient } from './client-selector'
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
      .select('id, nombre_del_negocio, cuentas_publicitarias(id_cuenta, nombre_cuenta, plataforma, activo)')
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

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground md:px-8">
      <div className="mx-auto flex w-full flex-col gap-6">
        <header className="flex flex-col gap-2 border-b pb-6">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="size-5" aria-hidden="true" />
            <span className="font-mono text-xs uppercase tracking-[0.18em]">AI WORKSPACE - QA VERSION</span>
          </div>
          <h1 className={cn(displayFont.className, 'text-balance text-4xl italic tracking-tight text-foreground md:text-5xl')}>
            Paid Media Assistant
          </h1>
          <p className="max-w-2xl text-pretty text-muted-foreground">
            Elegí un cliente para que el sistema analice sus cuentas publicitarias y responda tus consultas.
          </p>
        </header>

        <div className="flex flex-col gap-6 lg:flex-row">
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
              <ClientSelector value={selectedClient} onChange={setSelectedClient} />
            </div>
            {selectedClient && <ScoreConfigPanel clientId={selectedClient.id} onSaved={setScoreConfig} />}
            {selectedClient && <PaidMediaBackfillPanel clientId={selectedClient.id} clientName={selectedClient.nombre_del_negocio} />}

            {selectedClient && loadingMemory && <div className="flex flex-col gap-4"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>}
            {selectedClient && !loadingMemory && editingMemory && <ClientContextForm clientId={selectedClient.id} clientName={selectedClient.nombre_del_negocio} initialMemory={memory} mode="edit" onCancel={() => setEditingMemory(false)} onCompleted={(updated) => { setMemory(updated); setEditingMemory(false); setActive(true); toast.success('Memoria del cliente actualizada.') }} />}
            {selectedClient && !loadingMemory && !active && <ClientContextForm clientId={selectedClient.id} clientName={selectedClient.nombre_del_negocio} initialMemory={memory} onCompleted={(updated) => { setMemory(updated); setActive(true) }} />}
            {active && (
              <SupervisorChat
                key={selectedClient?.id ?? 'no-client'}
                clientId={selectedClient?.id ?? null}
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
