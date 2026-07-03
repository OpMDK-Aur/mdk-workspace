// components/agentes/revops/revops-detail-sheet.tsx
'use client'

import { useEffect, useState } from 'react'
import type { ClienteConRevOps } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Maximize2, Minimize2 } from 'lucide-react'

interface RevOpsDetailSheetProps {
  cliente: ClienteConRevOps | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  )
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`
}

function formatDuracion(minutos: number | null): string {
  if (minutos == null || isNaN(minutos)) return '—'
  const totalMs = Math.round(minutos * 60 * 1000)
  const h = Math.floor(totalMs / 3_600_000)
  const m = Math.floor((totalMs % 3_600_000) / 60_000)
  const s = Math.floor((totalMs % 60_000) / 1_000)
  const ms = totalMs % 1_000

  const partes: string[] = []
  if (h > 0) partes.push(`${h}h`)
  if (h > 0 || m > 0) partes.push(`${m}m`)
  partes.push(`${s}s`)
  partes.push(`${ms}ms`)

  return partes.join(' ')
}

export function RevOpsDetailSheet({ cliente, open, onOpenChange }: RevOpsDetailSheetProps) {
  const ejecucion = cliente?.ultima_ejecucion
  const r = ejecucion?.resumen
  const [fullScreen, setFullScreen] = useState(false)

  // Volver a tamaño normal cada vez que se cierra el panel, para que el
  // próximo cliente que se abra arranque siempre en el tamaño chico.
  useEffect(() => {
    if (!open) setFullScreen(false)
  }, [open])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={cn(
          'overflow-y-auto p-0',
          fullScreen ? 'w-screen sm:max-w-none' : 'w-full sm:max-w-2xl'
        )}
      >
        <SheetHeader className="px-6 py-5 border-b border-border">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div>
              <SheetTitle>{cliente?.nombre_del_negocio}</SheetTitle>
              {ejecucion && (
                <p className="text-xs text-muted-foreground mt-1">
                  Analizado el {new Date(ejecucion.ejecutado_en).toLocaleString('es-AR')} · Periodo{' '}
                  {ejecucion.periodo_desde} a {ejecucion.periodo_hasta}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setFullScreen((v) => !v)}
              title={fullScreen ? 'Volver a tamaño normal' : 'Expandir a pantalla completa'}
            >
              {fullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </SheetHeader>

        <div className="px-6 py-6">
          {!r ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sin análisis disponible todavía.</p>
          ) : (
          <div className="space-y-6 mt-4">
            {r.alertas.length > 0 && (
              <div className="space-y-2">
                {r.alertas.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm text-red-500">{a.mensaje}</p>
                      <p className="text-xs text-muted-foreground">{a.calculo}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Tabs defaultValue="tareas">
              <TabsList className="grid grid-cols-3 sm:grid-cols-6 h-auto">
                <TabsTrigger value="tareas">Tareas</TabsTrigger>
                <TabsTrigger value="conversaciones">Conversaciones</TabsTrigger>
                <TabsTrigger value="inbox">Inbox</TabsTrigger>
                <TabsTrigger value="oportunidades">Oportunidades</TabsTrigger>
                <TabsTrigger value="embudo">Embudo</TabsTrigger>
                <TabsTrigger value="tiempos">Tiempos</TabsTrigger>
              </TabsList>

              <TabsContent value="tareas" className="space-y-3 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Oportunidades en muestra" value={r.tareas.oportunidades_en_muestra} />
                  <Stat label="Sin ninguna tarea" value={r.tareas.sin_tarea} />
                  <Stat label="Tareas vencidas" value={r.tareas.tareas_vencidas} />
                  <Stat label="Tareas futuras" value={r.tareas.tareas_futuras} />
                  <Stat label="Tareas completadas" value={r.tareas.tareas_completadas} />
                  <Stat label="% vencidas" value={pct(r.tareas.pct_vencidas)} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Calculado sobre una muestra de las oportunidades abiertas más recientes, consultando las tareas del
                  contacto asociado en GHL.
                </p>
              </TabsContent>

              <TabsContent value="conversaciones" className="space-y-3 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Conversaciones evaluadas" value={r.conversaciones_calidad.muestreadas} />
                  <Stat label="Score promedio" value={r.conversaciones_calidad.promedio_score?.toFixed(1) ?? '—'} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Se cuentan solo conversaciones con diálogo real entre el bot/vendedor y el contacto. Se excluye la
                  actividad automática del sistema de GHL (cambios de etapa, notas internas, avisos automáticos, etc.),
                  que no son mensajes intercambiados con el contacto.
                </p>
                <div className="space-y-2">
                  {r.conversaciones_calidad.detalle.map((d) => (
                    <div key={d.conversacionId} className="border border-border rounded-lg p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{d.contacto}</p>
                        <Badge variant="outline">{d.score}/10</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{d.resumen}</p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {!d.escucha_antes_de_ofrecer && <Badge variant="outline" className="text-amber-500">No escucha antes de ofrecer</Badge>}
                        {!d.personaliza_respuesta && <Badge variant="outline" className="text-amber-500">Respuesta genérica</Badge>}
                        {!d.hace_preguntas_indagacion && <Badge variant="outline" className="text-amber-500">Sin indagación</Badge>}
                        {!d.propone_proximo_paso && <Badge variant="outline" className="text-amber-500">Sin próximo paso</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="inbox" className="space-y-3 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Conversaciones activas" value={r.inbox.total_conversaciones_activas} />
                  <Stat label="Sin leer" value={r.inbox.total_sin_leer} />
                  <Stat label="+2hs hábiles sin respuesta" value={r.inbox.mas_2hs_sin_respuesta} />
                  <Stat label="SLA configurado" value={r.inbox.sla_configurado ? 'Sí' : 'No'} />
                </div>
                <div className="space-y-1.5">
                  {r.inbox.conversaciones_criticas.map((c) => (
                    <div key={c.conversacionId} className="flex justify-between text-sm border border-border rounded-md px-3 py-2">
                      <span>{c.contacto}</span>
                      <span className="text-red-500">{formatDuracion(c.horasSinResponder * 60)} sin responder</span>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="oportunidades" className="space-y-3 mt-4">
                <p className="text-xs text-muted-foreground">
                  Calculado sobre oportunidades creadas entre {ejecucion?.periodo_desde} y {ejecucion?.periodo_hasta}.
                  Si no coincide con lo que ves en GHL, revisá que tengas el mismo rango de fechas seleccionado ahí.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Abiertas" value={r.oportunidades.total_abiertas} />
                  <Stat label="Sin monto" value={`${r.oportunidades.sin_monto} (${pct(r.oportunidades.pct_sin_monto)})`} />
                  <Stat label="Sin responsable" value={`${r.oportunidades.sin_responsable} (${pct(r.oportunidades.pct_sin_responsable)})`} />
                  <Stat label="Sin actividad 30d+" value={`${r.oportunidades.sin_actividad_30d} (${pct(r.oportunidades.pct_sin_actividad_30d)})`} />
                  <Stat label="Creadas en el periodo" value={r.oportunidades.creadas_en_periodo} />
                  <Stat label="Conversaciones totales en GHL" value={r.oportunidades.conversaciones_en_periodo} />
                </div>
              </TabsContent>

              <TabsContent value="embudo" className="space-y-3 mt-4">
                <p className="text-xs text-muted-foreground">
                  Calculado sobre oportunidades creadas entre {ejecucion?.periodo_desde} y {ejecucion?.periodo_hasta}.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Estancadas 30d+" value={r.embudo.estancadas_30} />
                  <Stat label="Estancadas 60d+" value={r.embudo.estancadas_60} />
                  <Stat label="Estancadas 90d+" value={r.embudo.estancadas_90} />
                  <Stat label="Duplicados probables" value={r.embudo.duplicados_probables} />
                  <Stat label="Inconsistencias de estado" value={r.embudo.inconsistencias_estado} />
                  <Stat label="Etapas iniciales saturadas" value={r.embudo.etapas_iniciales_saturadas ? 'Sí' : 'No'} />
                </div>
                {r.embudo.etapas_sospechosas.length > 0 && (
                  <p className="text-sm text-amber-500">
                    Etapas sospechosas: {r.embudo.etapas_sospechosas.join(', ')}
                  </p>
                )}
                <div className="space-y-1">
                  {r.embudo.por_etapa
                    .sort((a, b) => b.cantidad - a.cantidad)
                    .map((e, i) => (
                      <div key={i} className="flex justify-between text-sm border-b border-border/50 py-1.5">
                        <span>{e.pipeline} · {e.etapa}</span>
                        <span className="font-medium">{e.cantidad}</span>
                      </div>
                    ))}
                </div>
              </TabsContent>

              <TabsContent value="tiempos" className="space-y-3 mt-4">
                <p className="text-xs text-muted-foreground">
                  &quot;Conversaciones evaluadas&quot; cuenta solo las que tuvieron diálogo real (mensaje del contacto +
                  respuesta), excluyendo actividad automática del sistema de GHL.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Conversaciones evaluadas" value={r.tiempos_respuesta.muestreadas} />
                  <Stat
                    label="Primera respuesta (prom., horario hábil)"
                    value={formatDuracion(r.tiempos_respuesta.promedio_primera_respuesta_min)}
                  />
                  <Stat
                    label="Handoff IA → humano (prom., horario hábil)"
                    value={formatDuracion(r.tiempos_respuesta.promedio_handoff_min)}
                  />
                  <Stat label="Handoffs sin tomar" value={r.tiempos_respuesta.handoffs_sin_tomar} />
                </div>
                {r.tiempos_respuesta.muestreadas > 0 && r.tiempos_respuesta.muestreadas < 5 && (
                  <p className="text-xs text-amber-500">
                    Muestra muy chica ({r.tiempos_respuesta.muestreadas} conversaciones con diálogo real
                    encontradas) — los promedios de arriba no son representativos. Esto generalmente significa que
                    casi todas las conversaciones activas del CRM son solo actividad automática, sin interacción
                    humana real.
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}