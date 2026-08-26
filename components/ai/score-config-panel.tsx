'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function ScoreConfigPanel({ clientId, onSaved }: { clientId: string; onSaved?: (config: { descriptions: { low: string; intermediate: string; high: string } }) => void }) {
  const defaults = { low: 'Campaña con CPL alto, 0 impresiones o 0 conversiones. Optimización baja y necesita acciones inmediatas.', intermediate: 'Campaña con señales mixtas: el rendimiento requiere seguimiento y ajustes para mejorar la eficiencia.', high: 'Campaña con buen volumen, conversiones y eficiencia. Optimización alta; mantener y escalar con control.' }
  const [descriptions, setDescriptions] = useState(defaults)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setOpen(false)
    setMessage('')
    fetch(`/api/ai/score-config?clientId=${encodeURIComponent(clientId)}`)
      .then((response) => response.json())
      .then((data) => { setDescriptions({ low: data.lowDescription || defaults.low, intermediate: data.intermediateDescription || defaults.intermediate, high: data.highDescription || defaults.high }) })
      .catch(() => setMessage('No se pudo cargar la configuración.'))
  }, [clientId])

  async function save() {
    setMessage('')
    if (Object.values(descriptions).some((value) => value.trim().length < 10)) { setMessage('Cada descripción debe tener al menos 10 caracteres.'); return }
    setSaving(true)
    try {
      const response = await fetch('/api/ai/score-config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, ...descriptions }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar la configuración.')
      setDescriptions({ low: data.lowDescription || defaults.low, intermediate: data.intermediateDescription || defaults.intermediate, high: data.highDescription || defaults.high }); onSaved?.({ descriptions: { low: data.lowDescription || defaults.low, intermediate: data.intermediateDescription || defaults.intermediate, high: data.highDescription || defaults.high } }); setMessage('Configuración guardada.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar la configuración.') } finally { setSaving(false) }
  }

  return <section className="flex flex-col gap-4 rounded-lg border bg-card p-4" aria-labelledby="score-config-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="score-config-title" className="font-medium">Optimización de campañas</h2><p className="text-sm text-muted-foreground">Definí qué significa una optimización baja, intermedia o alta para este cliente.</p></div><Button type="button" variant="outline" size="sm" onClick={() => setOpen((value) => !value)}>{open ? 'Ocultar configuración' : 'Configurar niveles'}</Button></div>
    {open && <div className="flex flex-col gap-4 border-t pt-4">{([['low', 'Baja'], ['intermediate', 'Intermedia'], ['high', 'Alta']] as const).map(([key, label]) => <label key={key} className="flex flex-col gap-2 text-sm"><span className="font-medium">Optimización {label}</span><Textarea value={descriptions[key]} onChange={(event) => setDescriptions((current) => ({ ...current, [key]: event.target.value }))} rows={4} placeholder={`Describí cuándo una campaña tiene optimización ${label.toLowerCase()}.`} /></label>)}<div className="flex items-center gap-3"><Button type="button" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar configuración'}</Button>{message && <span className="text-sm text-muted-foreground" role="status">{message}</span>}</div></div>}
  </section>
}
