'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function ScoreConfigPanel({ clientId, onSaved }: { clientId: string; onSaved?: (config: { coldMax: number; warmMax: number }) => void }) {
  const [coldMax, setColdMax] = useState('39')
  const [warmMax, setWarmMax] = useState('69')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setOpen(false)
    setMessage('')
    fetch(`/api/ai/score-config?clientId=${encodeURIComponent(clientId)}`)
      .then((response) => response.json())
      .then((data) => { if (typeof data.coldMax === 'number') setColdMax(String(data.coldMax)); if (typeof data.warmMax === 'number') setWarmMax(String(data.warmMax)) })
      .catch(() => setMessage('No se pudo cargar la configuración.'))
  }, [clientId])

  async function save() {
    setMessage('')
    const cold = Number(coldMax); const warm = Number(warmMax)
    if (!Number.isInteger(cold) || !Number.isInteger(warm) || cold < 0 || warm > 100 || cold >= warm) { setMessage('Usá dos valores enteros: frío debe ser menor que tibio, entre 0 y 100.'); return }
    setSaving(true)
    try {
      const response = await fetch('/api/ai/score-config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, coldMax: cold, warmMax: warm }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar la configuración.')
      setColdMax(String(data.coldMax)); setWarmMax(String(data.warmMax)); onSaved?.({ coldMax: data.coldMax, warmMax: data.warmMax }); setMessage('Configuración guardada.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar la configuración.') } finally { setSaving(false) }
  }

  return <section className="flex flex-col gap-3 rounded-lg border bg-card p-4" aria-labelledby="score-config-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="score-config-title" className="font-medium">Temperatura de optimización</h2><p className="text-sm text-muted-foreground">Umbrales de score para este cliente: 0–100.</p></div><Button type="button" variant="outline" size="sm" onClick={() => setOpen((value) => !value)}>{open ? 'Ocultar configuración' : 'Configurar umbrales'}</Button></div>
    {open && <div className="flex flex-col gap-4 border-t pt-4"><div className="grid gap-4 sm:grid-cols-2"><label className="flex flex-col gap-2 text-sm"><span>Frío: hasta</span><Input type="number" min="0" max="98" value={coldMax} onChange={(event) => setColdMax(event.target.value)} /><span className="text-xs text-muted-foreground">0–{coldMax || '…'}</span></label><label className="flex flex-col gap-2 text-sm"><span>Tibio: hasta</span><Input type="number" min="1" max="99" value={warmMax} onChange={(event) => setWarmMax(event.target.value)} /><span className="text-xs text-muted-foreground">{Number(coldMax) + 1 || '…'}–{warmMax || '…'}</span></label></div><p className="text-xs text-muted-foreground">Caliente comienza en {Number(warmMax) + 1 || '…'}.</p><div className="flex items-center gap-3"><Button type="button" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar umbrales'}</Button>{message && <span className="text-sm text-muted-foreground" role="status">{message}</span>}</div></div>}
  </section>
}
