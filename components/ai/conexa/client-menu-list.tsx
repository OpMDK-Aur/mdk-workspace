'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, LoaderCircle, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

type MenuClient = { id: string; nombre_del_negocio: string | null; activo?: boolean | null }
type SyncState = { status: 'syncing' } | { status: 'not-found' } | { status: 'error'; message: string }

const PREFS_KEY = 'conexa:client-menu-prefs'
type Prefs = { hideInactive: boolean; hideUnconnected: boolean }

type Props<T extends MenuClient> = {
  clients: T[]
  loading: boolean
  error: string | null
  search: string
  onSearchChange: (value: string) => void
  isConnected: (client: T) => boolean
  onSelect: (client: T) => void
  /** Se llama cuando la sincronización vinculó cuentas, para recargar el cliente. */
  onSynced: (clientId: string) => Promise<void> | void
  onConnect: (client: T) => void
}

export function ClientMenuList<T extends MenuClient>({ clients, loading, error, search, onSearchChange, isConnected, onSelect, onSynced, onConnect }: Props<T>) {
  const [prefs, setPrefs] = useState<Prefs>({ hideInactive: false, hideUnconnected: false })
  const [sync, setSync] = useState<Record<string, SyncState>>({})

  // Preferencia visual del usuario en este navegador; no son datos del negocio.
  useEffect(() => { try { const saved = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? 'null'); if (saved) setPrefs({ hideInactive: Boolean(saved.hideInactive), hideUnconnected: Boolean(saved.hideUnconnected) }) } catch { /* preferencia inválida: se usan los valores por defecto */ } }, [])
  const updatePrefs = (next: Partial<Prefs>) => setPrefs((current) => { const value = { ...current, ...next }; try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(value)) } catch { /* sin almacenamiento disponible */ } return value })

  const runSync = async (client: T) => {
    setSync((current) => ({ ...current, [client.id]: { status: 'syncing' } }))
    try {
      const response = await fetch('/api/conexa/clients/auto-sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: client.id }) })
      const payload = await response.json().catch(() => ({})) as { found?: boolean; error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo sincronizar.')
      if (!payload.found) { setSync((current) => ({ ...current, [client.id]: { status: 'not-found' } })); return }
      await onSynced(client.id)
      setSync((current) => { const next = { ...current }; delete next[client.id]; return next })
    } catch (cause) {
      setSync((current) => ({ ...current, [client.id]: { status: 'error', message: cause instanceof Error ? cause.message : 'No se pudo sincronizar.' } }))
    }
  }

  const query = search.trim().toLowerCase()
  const inactiveCount = clients.filter((client) => client.activo === false).length
  const unconnectedCount = clients.filter((client) => client.activo !== false && !isConnected(client)).length
  const visible = clients.filter((client) => {
    if (!String(client.nombre_del_negocio ?? '').toLowerCase().includes(query)) return false
    if (prefs.hideInactive && client.activo === false) return false
    if (prefs.hideUnconnected && client.activo !== false && !isConnected(client)) return false
    return true
  })

  return (
    <div className="flex flex-col">
      <input autoFocus value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Buscar cliente..." aria-label="Buscar cliente" className="mb-1.5 w-full rounded-md border border-[#e6e6e3] bg-[#fafaf8] px-2.5 py-2 text-[12px] outline-none focus:border-[#5b5fe8]" />
      <div className="mb-1.5 flex flex-wrap gap-1.5 px-0.5">
        <ToggleChip label={`Ocultar inactivas${inactiveCount ? ` (${inactiveCount})` : ''}`} checked={prefs.hideInactive} onChange={(value) => updatePrefs({ hideInactive: value })} />
        <ToggleChip label={`Ocultar sin cuentas${unconnectedCount ? ` (${unconnectedCount})` : ''}`} checked={prefs.hideUnconnected} onChange={(value) => updatePrefs({ hideUnconnected: value })} />
      </div>
      <div className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain pr-0.5">
        {loading ? <p className="px-2.5 py-3 text-[12px] text-[#9a9a9a]">Cargando clientes...</p>
          : error ? <p className="px-2.5 py-3 text-[12px] text-[#b42318]">{error}</p>
          : !visible.length ? <p className="px-2.5 py-3 text-[12px] text-[#9a9a9a]">No se encontraron clientes</p>
          : visible.map((client) => {
            const inactive = client.activo === false
            const connected = isConnected(client)
            const name = client.nombre_del_negocio ?? 'Cliente sin nombre'
            if (!inactive && connected) return <button type="button" key={client.id} onClick={() => onSelect(client)} className="block w-full rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-[#f5f5f5]">{name}</button>
            const state = sync[client.id]
            const legend = state?.status === 'syncing' ? 'Buscando cuentas por nombre...' : state?.status === 'not-found' ? 'No se encontraron cuentas con este nombre' : state?.status === 'error' ? state.message : 'Sin cuentas conectadas'
            return (
              <div key={client.id} aria-disabled="true" className="flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[#a3a3a0]">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px]">{name}</p>
                  {!inactive && <p className={cn('text-[10px] leading-4', state?.status === 'error' ? 'text-[#b42318]' : 'text-[#a3a3a0]')}>{legend}</p>}
                </div>
                {inactive ? <span className="shrink-0 rounded-full bg-[#f1f1ef] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#8a8a87]">Inactiva</span> : <>
                  <button type="button" onClick={() => void runSync(client)} disabled={state?.status === 'syncing'} aria-label={`Sincronizar cuentas de ${name} automáticamente`} title="Sincronizar con Conexa: busca cuentas con este nombre en Meta Ads, Google Ads, GA4 y Tag Manager" className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#eef0ff] text-[#5b5fe8] hover:bg-[#e2e5ff] disabled:opacity-70">
                    {state?.status === 'syncing' ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                  </button>
                  {(state?.status === 'not-found' || state?.status === 'error') && <button type="button" onClick={() => onConnect(client)} aria-label={`Conectar cuentas de ${name}`} title="Ir a conectar" className="flex size-6 shrink-0 items-center justify-center rounded-md text-[#777] hover:bg-[#f1f1ef] hover:text-[#333]"><ArrowRight className="size-3.5" /></button>}
                </>}
              </div>
            )
          })}
      </div>
    </div>
  )
}

function ToggleChip({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', checked ? 'border-[#5b5fe8] bg-[#eef0ff] text-[#4447c9]' : 'border-[#e6e6e3] text-[#777] hover:border-[#cfcfcc]')}>{label}</button>
}
