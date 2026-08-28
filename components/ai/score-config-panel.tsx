'use client'

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function ScoreConfigPanel({ clientId, onSaved }: { clientId: string; onSaved?: (config: { objective: string }) => void }) {
  const defaultObjective = 'Optimizar el costo por lead (CPL) y aumentar la cantidad de conversiones calificadas sin desperdiciar presupuesto.'
  const [objective, setObjective] = useState(defaultObjective)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setOpen(false)
    setMessage('')
    fetch(`/api/ai/score-config?clientId=${encodeURIComponent(clientId)}`)
      .then((response) => response.json())
      .then((data) => { setObjective(data.objective || defaultObjective) })
      .catch(() => setMessage('No se pudo cargar la configuración.'))
  }, [clientId])

  async function suggest() {
    setMessage('')
    setSuggesting(true)
    try {
      const response = await fetch('/api/ai/score-config/suggest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, objective }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'No se pudo generar la sugerencia.')
      setObjective(data.objective || objective)
      setMessage('Sugerencia generada. Revisá el texto y guardá cuando estés de acuerdo.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo generar la sugerencia.') } finally { setSuggesting(false) }
  }

  async function save() {
    setMessage('')
    if (objective.trim().length < 10) { setMessage('El objetivo debe tener al menos 10 caracteres.'); return }
    setSaving(true)
    try {
      const response = await fetch('/api/ai/score-config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, objective }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar la configuración. Intentá nuevamente.')
      if (typeof data.objective !== 'string') throw new Error('La API no confirmó el objetivo guardado. Intentá nuevamente.')
      setObjective(data.objective); onSaved?.({ objective: data.objective }); setMessage('Objetivo guardado. Los tres niveles se interpretarán en relación con este objetivo.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar la configuración.') } finally { setSaving(false) }
  }

  return <section className="flex flex-col gap-4 rounded-lg border bg-card p-4" aria-labelledby="score-config-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="score-config-title" className="font-medium">Optimización de campañas</h2><p className="text-sm text-muted-foreground">Definí el objetivo único de optimización para este cliente.</p></div><Button type="button" variant="outline" size="sm" onClick={() => setOpen((value) => !value)}>{open ? 'Ocultar configuración' : 'Configurar niveles'}</Button></div>
    {open && <div className="flex flex-col gap-4 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed bg-muted/40 p-3">
        <p className="text-sm text-muted-foreground">Escribí un único objetivo. La IA interpretará siempre los tres niveles en relación con él, sin mezclar objetivos distintos.</p>
        <Button type="button" variant="secondary" size="sm" onClick={suggest} disabled={suggesting} className="shrink-0 gap-1.5">
          <Sparkles className="size-4" aria-hidden="true" />
          {suggesting ? 'Mejorando objetivo…' : 'Sugerir con IA'}
        </Button>
      </div>
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-medium">Objetivo único de optimización</span>
        <span className="text-xs text-muted-foreground">Ejemplo: reducir el CPL y aumentar conversiones calificadas sin superar el presupuesto.</span>
        <Textarea value={objective} onChange={(event) => setObjective(event.target.value)} rows={4} placeholder="Definí qué querés optimizar en esta cuenta…" disabled={suggesting} />
      </label>
      <div className="rounded-md border bg-muted/30 p-3 text-sm leading-6">
        <p className="font-medium">Cómo se interpretan los niveles</p>
        <ul className="mt-1 list-disc pl-5 text-muted-foreground">
          <li><strong>Baja:</strong> no alcanza el objetivo y requiere acciones inmediatas.</li>
          <li><strong>Intermedia:</strong> se acerca o muestra señales mixtas; requiere seguimiento y ajustes.</li>
          <li><strong>Buena:</strong> alcanza el objetivo con evidencia suficiente; se puede mantener o escalar con control.</li>
        </ul>
      </div>
      <div className="flex items-center gap-3"><Button type="button" onClick={save} disabled={saving || suggesting}>{saving ? 'Guardando…' : 'Guardar objetivo'}</Button>{message && <span className="text-sm text-muted-foreground" role="status">{message}</span>}</div>
    </div>}
  </section>
}
