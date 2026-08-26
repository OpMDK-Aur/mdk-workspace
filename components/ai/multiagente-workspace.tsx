'use client'

import { useEffect, useState } from 'react'
import { Pencil, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  const [editingMemory, setEditingMemory] = useState(false)
  useEffect(() => { if (!selectedClient) { setMemory(null); setActive(false); setEditingMemory(false); return }; setActive(false); setEditingMemory(false); setLoadingMemory(true); fetch(`/api/ai/client-memory?clientId=${encodeURIComponent(selectedClient.id)}`).then((r) => r.json()).then((data) => { const loadedMemory = data.memory as ClientMemory | null; setMemory(loadedMemory); setActive(Boolean(loadedMemory)) }).finally(() => setLoadingMemory(false)) }, [selectedClient])

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
          <div className="flex flex-wrap items-center gap-3">
            <ClientSelector value={selectedClient} onChange={setSelectedClient} />
            {selectedClient && memory && !loadingMemory && !editingMemory && <Button variant="outline" size="sm" onClick={() => setEditingMemory(true)}><Pencil className="mr-2 size-4" aria-hidden="true" />Actualizar memoria</Button>}
          </div>
        </div>

        {selectedClient && loadingMemory && <div className="flex flex-col gap-4"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>}
        {selectedClient && !loadingMemory && editingMemory && <ClientContextForm clientId={selectedClient.id} clientName={selectedClient.nombre_del_negocio} initialMemory={memory} mode="edit" onCancel={() => setEditingMemory(false)} onCompleted={(updated) => { setMemory(updated); setEditingMemory(false); setActive(true) }} />}
        {selectedClient && !loadingMemory && !active && !memory && <ClientContextForm clientId={selectedClient.id} clientName={selectedClient.nombre_del_negocio} initialMemory={null} onCompleted={(updated) => { setMemory(updated); setActive(true) }} />}
        {active && <SupervisorChat key={selectedClient?.id ?? 'no-client'} clientId={selectedClient?.id ?? null} disabled={!selectedClient} disabledMessage="Seleccioná un cliente para comenzar el análisis." title="Análisis del cliente" description="El Multiagente consulta el contexto de la cuenta y responde con datos reales." />}
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
