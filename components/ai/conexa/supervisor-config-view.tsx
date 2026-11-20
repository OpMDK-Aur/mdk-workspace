'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { LoaderCircle, Lock, RotateCcw, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'

type SupervisorTool = { key: string; description: string; enabled: boolean; required: boolean }
type SupervisorConfig = { id: string; name: string; model: string; systemPrompt: string; updatedAt: string; tools: SupervisorTool[] }

const fetcher = async (url: string): Promise<SupervisorConfig> => {
  const response = await fetch(url)
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error ?? 'No se pudo cargar la configuración.')
  return result
}

export function SupervisorConfigView() {
  const { data, error, isLoading, mutate } = useSWR('/api/ai/supervisor-config', fetcher, { revalidateOnFocus: false })
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'ok' | 'error'; message: string } | null>(null)

  const prompt = draft ?? data?.systemPrompt ?? ''
  const dirty = draft !== null && draft !== data?.systemPrompt
  const activeTools = data?.tools.filter((tool) => tool.enabled) ?? []
  const inactiveTools = data?.tools.filter((tool) => !tool.enabled) ?? []

  const save = async () => {
    if (!dirty || saving) return
    setSaving(true)
    setStatus(null)
    try {
      const response = await fetch('/api/ai/supervisor-config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ systemPrompt: prompt }) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar el prompt.')
      await mutate(data ? { ...data, systemPrompt: result.systemPrompt, updatedAt: result.updatedAt } : undefined, { revalidate: false })
      setDraft(null)
      setStatus({ type: 'ok', message: 'Prompt guardado. Se aplica desde la próxima consulta.' })
    } catch (saveError) {
      setStatus({ type: 'error', message: saveError instanceof Error ? saveError.message : 'No se pudo guardar el prompt.' })
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground"><LoaderCircle className="mr-2 size-4 animate-spin text-primary" />Cargando agente supervisor...</div>
  if (error || !data) return <div className="flex h-full items-center justify-center p-6 text-[12px] text-destructive">{error instanceof Error ? error.message : 'No se pudo cargar la configuración.'}</div>

  return (
    <div className="h-full overflow-y-auto bg-muted">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 p-6">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-[20px] font-bold tracking-[-.02em] text-foreground">Agente supervisor</h1>
          <p className="text-pretty text-[12.5px] leading-relaxed text-muted-foreground">Editá las instrucciones base que usa Conexa en cada consulta. El contexto del cliente y las reglas de seguridad se agregan automáticamente después de este prompt.</p>
          <p className="text-[11px] text-muted-foreground">Modelo configurado: {data.model} · Última edición: {new Date(data.updatedAt).toLocaleString('es-AR')}</p>
        </header>

        <section aria-labelledby="supervisor-prompt-title" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="supervisor-prompt-title" className="text-[13px] font-semibold text-foreground">Prompt del sistema</h2>
            <span className="text-[11px] text-muted-foreground">{prompt.length.toLocaleString('es-AR')} caracteres</span>
          </div>
          <label htmlFor="supervisor-prompt" className="sr-only">Prompt del agente supervisor</label>
          <textarea
            id="supervisor-prompt"
            value={prompt}
            onChange={(event) => { setDraft(event.target.value); setStatus(null) }}
            spellCheck={false}
            className="min-h-[420px] w-full resize-y rounded-lg border border-border bg-muted p-3 font-mono text-[12px] leading-relaxed text-foreground outline-none focus:border-primary"
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {status && <p role="status" className={cn('mr-auto text-[12px]', status.type === 'ok' ? 'text-status-verde' : 'text-destructive')}>{status.message}</p>}
            <button type="button" disabled={!dirty || saving} onClick={() => { setDraft(null); setStatus(null) }} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"><RotateCcw className="size-3.5" />Descartar</button>
            <button type="button" disabled={!dirty || saving} onClick={save} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-[12px] font-semibold text-primary-foreground hover:bg-primary disabled:opacity-50">{saving && <LoaderCircle className="size-3.5 animate-spin" />}Guardar prompt</button>
          </div>
        </section>

        <section aria-labelledby="supervisor-tools-title" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-col gap-0.5">
            <h2 id="supervisor-tools-title" className="text-[13px] font-semibold text-foreground">Subagentes (tools) · {activeTools.length} activos</h2>
            <p className="text-[12px] leading-relaxed text-muted-foreground">Son las herramientas que el supervisor puede ejecutar para consultar datos. Las marcadas como fijas siempre están disponibles.</p>
          </div>
          <ul className="grid gap-2 md:grid-cols-2">
            {activeTools.map((tool) => <ToolItem key={tool.key} tool={tool} />)}
          </ul>
          {inactiveTools.length > 0 && <>
            <h3 className="mt-2 text-[11px] font-bold uppercase tracking-[.08em] text-muted-foreground">No habilitadas</h3>
            <ul className="grid gap-2 md:grid-cols-2">
              {inactiveTools.map((tool) => <ToolItem key={tool.key} tool={tool} />)}
            </ul>
          </>}
        </section>
      </div>
    </div>
  )
}

function ToolItem({ tool }: { tool: SupervisorTool }) {
  return (
    <li className={cn('flex gap-2.5 rounded-lg border border-border p-3', !tool.enabled && 'opacity-60')}>
      <Wrench className={cn('mt-0.5 size-4 shrink-0', tool.enabled ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <code className="truncate font-mono text-[11.5px] font-semibold text-foreground">{tool.key}</code>
          {tool.required && <span className="flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-primary"><Lock className="size-2.5" aria-hidden="true" />Fija</span>}
          {!tool.enabled && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9.5px] font-semibold text-muted-foreground">Inactiva</span>}
        </div>
        <p className="line-clamp-3 text-[11.5px] leading-relaxed text-muted-foreground">{tool.description}</p>
      </div>
    </li>
  )
}
