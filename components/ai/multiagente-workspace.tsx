'use client'

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { ClientSelector, type AnalyzableClient } from './client-selector'
import { SupervisorChat } from './supervisor-chat'
import { ClientContextForm } from './client-context-form'
import type { ClientMemory } from '@/lib/ai/client-memory'
import { Skeleton } from '@/components/ui/skeleton'

export function MultiagenteWorkspace() {
  const [selectedClient, setSelectedClient] = useState<AnalyzableClient | null>(null)
  const [memory, setMemory] = useState<ClientMemory | null>(null)
  const [loadingMemory, setLoadingMemory] = useState(false)
  const [active, setActive] = useState(false)
  useEffect(() => { if (!selectedClient) { setMemory(null); setActive(false); return }; setActive(false); setLoadingMemory(true); fetch(`/api/ai/client-memory?clientId=${encodeURIComponent(selectedClient.id)}`).then((r) => r.json()).then((data) => setMemory(data.memory)).finally(() => setLoadingMemory(false)) }, [selectedClient])

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground md:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-2 border-b pb-6">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="size-5" aria-hidden="true" />
            <span className="font-mono text-xs uppercase tracking-[0.18em]">AI workspace</span>
          </div>
          <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">Multiagente</h1>
          <p className="max-w-2xl text-pretty text-muted-foreground">
            Elegí un cliente para que el sistema analice sus cuentas publicitarias y responda tus consultas.
          </p>
        </header>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">Cliente a analizar</span>
          <ClientSelector value={selectedClient} onChange={setSelectedClient} />
        </div>

        {selectedClient && loadingMemory && <div className="flex flex-col gap-4"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>}
        {selectedClient && !loadingMemory && !active && memory && <ClientContextForm clientId={selectedClient.id} clientName={selectedClient.nombre_del_negocio} initialMemory={memory} onCompleted={(updated) => { setMemory(updated); setActive(true) }} />}
        {active && <SupervisorChat key={selectedClient?.id ?? 'no-client'} clientId={selectedClient?.id ?? null} disabled={!selectedClient} disabledMessage="Seleccioná un cliente para comenzar el análisis." title="Análisis del cliente" description="El Multiagente consulta el contexto de la cuenta y responde con datos reales." />}
      </div>
    </main>
  )
}
