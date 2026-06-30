'use client'

import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { 
  AlertCircle, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  TrendingUp,
  MessageSquare,
  Inbox,
  Target,
  GitBranch,
  Zap
} from 'lucide-react'
import type { ClienteConRevOps } from '@/lib/types/revops'

interface RevOpsDetailSheetProps {
  cliente: ClienteConRevOps | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RevOpsDetailSheet({
  cliente,
  open,
  onOpenChange,
}: RevOpsDetailSheetProps) {
  if (!cliente?.ultima_ejecucion) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{cliente?.nombre_del_negocio || 'Cliente'}</SheetTitle>
          </SheetHeader>
          <div className="py-8 text-center">
            <p className="text-muted-foreground">No hay datos de análisis disponibles</p>
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  const { resumen, ejecutado_en } = cliente.ultima_ejecucion

  // Alert Banners at top
  const AlertaBanners = () => {
    if (!resumen.alertas || resumen.alertas.length === 0) return null

    return (
      <div className="space-y-2 mb-6">
        {resumen.alertas.map((alerta, idx) => (
          <div
            key={idx}
            className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20"
          >
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-600 dark:text-red-400">{alerta}</p>
          </div>
        ))}
      </div>
    )
  }

  // Tab Components
  const TabTareas = () => {
    const { tareas } = resumen
    const pctVencidasColor = 
      tareas.pct_vencidas > 0.5 ? 'bg-red-500/15' :
      tareas.pct_vencidas > 0.25 ? 'bg-amber-500/15' :
      'bg-emerald-500/15'

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-card border">
            <p className="text-xs text-muted-foreground mb-1">Oportunidades en muestra</p>
            <p className="text-2xl font-bold">{tareas.oportunidades_en_muestra}</p>
          </div>
          <div className="p-4 rounded-lg bg-card border">
            <p className="text-xs text-muted-foreground mb-1">Total de tareas</p>
            <p className="text-2xl font-bold">{tareas.total_tareas}</p>
          </div>
          <div className="p-4 rounded-lg bg-card border">
            <p className="text-xs text-muted-foreground mb-1">Con tarea asignada</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{tareas.con_tarea}</p>
          </div>
          <div className="p-4 rounded-lg bg-card border">
            <p className="text-xs text-muted-foreground mb-1">Sin tarea asignada</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{tareas.sin_tarea}</p>
          </div>
        </div>

        {/* Tareas vencidas */}
        <div className={cn('p-4 rounded-lg border', pctVencidasColor)}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Tareas vencidas</p>
            <Badge variant="secondary">{Math.round(tareas.pct_vencidas * 100)}%</Badge>
          </div>
          <div className="w-full bg-background rounded-full h-2 overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', 
                tareas.pct_vencidas > 0.5 ? 'bg-red-500' :
                tareas.pct_vencidas > 0.25 ? 'bg-amber-500' :
                'bg-emerald-500'
              )}
              style={{ width: `${tareas.pct_vencidas * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>{tareas.tareas_vencidas} vencidas</span>
            <span>{tareas.tareas_completadas} completadas</span>
            <span>{tareas.tareas_futuras} futuras</span>
          </div>
        </div>

        {tareas.alerta_colapso && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-600 dark:text-red-400">Alerta: sistema de tareas saturado</p>
          </div>
        )}
      </div>
    )
  }

  const TabConversaciones = () => {
    const { conversaciones_calidad } = resumen
    const promedio = conversaciones_calidad.promedio_score ?? 0

    return (
      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-card border">
          <p className="text-xs text-muted-foreground mb-1">Score promedio de conversaciones</p>
          <div className="flex items-end gap-3">
            <p className="text-3xl font-bold">{promedio.toFixed(1)}</p>
            <p className="text-sm text-muted-foreground mb-1">/ 10</p>
          </div>
        </div>

        {conversaciones_calidad.detalle.length > 0 && (
          <div className="space-y-2">
            {conversaciones_calidad.detalle.map((conv) => (
              <div key={conv.conversacionId} className="p-3 rounded-lg border bg-card/50">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-sm">{conv.contacto}</p>
                    <p className="text-xs text-muted-foreground">{conv.conversacionId}</p>
                  </div>
                  <Badge variant="outline">
                    {conv.score}/10
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-1">
                  {conv.escucha_antes_de_ofrecer && (
                    <Badge variant="secondary" className="text-xs">Escucha</Badge>
                  )}
                  {conv.personaliza_respuesta && (
                    <Badge variant="secondary" className="text-xs">Personalizada</Badge>
                  )}
                  {conv.hace_preguntas_indagacion && (
                    <Badge variant="secondary" className="text-xs">Indagación</Badge>
                  )}
                  {conv.propone_proximo_paso && (
                    <Badge variant="secondary" className="text-xs">Próximo paso</Badge>
                  )}
                </div>

                {!conv.escucha_antes_de_ofrecer && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> No escucha antes de ofrecer
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const TabInbox = () => {
    const { inbox } = resumen

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-card border">
            <p className="text-xs text-muted-foreground mb-1">Conversaciones activas</p>
            <p className="text-2xl font-bold">{inbox.total_conversaciones_activas}</p>
          </div>
          <div className="p-4 rounded-lg bg-card border">
            <p className="text-xs text-muted-foreground mb-1">Sin leer</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{inbox.total_sin_leer}</p>
          </div>
        </div>

        {/* Críticas (>2hs) */}
        {inbox.mas_2hs_sin_respuesta > 0 && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="font-medium text-sm text-red-600 dark:text-red-400 mb-2">
              {inbox.mas_2hs_sin_respuesta} conversación(es) sin respuesta {'>'} 2hs
            </p>
            {inbox.conversaciones_criticas.length > 0 && (
              <div className="space-y-2">
                {inbox.conversaciones_criticas.map((conv) => (
                  <div key={conv.conversacionId} className="text-xs p-2 rounded bg-red-500/5 border border-red-500/10">
                    <p className="font-medium">{conv.contacto}</p>
                    <p className="text-red-600 dark:text-red-400">
                      {conv.horasSinResponder.toFixed(1)}h sin responder
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const TabOportunidades = () => {
    const { oportunidades } = resumen

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-card border">
            <p className="text-xs text-muted-foreground mb-1">Oportunidades abiertas</p>
            <p className="text-2xl font-bold">{oportunidades.total_abiertas}</p>
          </div>
          <div className="p-4 rounded-lg bg-card border">
            <p className="text-xs text-muted-foreground mb-1">Creadas en período</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{oportunidades.creadas_en_periodo}</p>
          </div>
        </div>

        {/* Indicadores de calidad */}
        <div className="space-y-3">
          <div className="p-3 rounded-lg border bg-card/50">
            <p className="text-xs text-muted-foreground mb-2">Sin monto</p>
            <p className="text-lg font-bold">{oportunidades.pct_sin_monto}%</p>
            <p className="text-xs text-muted-foreground">({oportunidades.sin_monto} oportunidades)</p>
          </div>

          <div className="p-3 rounded-lg border bg-card/50">
            <p className="text-xs text-muted-foreground mb-2">Sin responsable</p>
            <p className="text-lg font-bold">{oportunidades.pct_sin_responsable}%</p>
            <p className="text-xs text-muted-foreground">({oportunidades.sin_responsable} oportunidades)</p>
          </div>

          <div className="p-3 rounded-lg border bg-amber-500/10">
            <p className="text-xs text-muted-foreground mb-2">Sin actividad 30+ días</p>
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{oportunidades.pct_sin_actividad_30d}%</p>
            <p className="text-xs text-amber-600 dark:text-amber-400">({oportunidades.sin_actividad_30d} oportunidades)</p>
          </div>
        </div>

        <div className="text-xs text-muted-foreground p-3 rounded-lg bg-muted/30">
          <p><strong>Conversaciones en período:</strong> {oportunidades.conversaciones_en_periodo}</p>
        </div>
      </div>
    )
  }

  const TabEmbudo = () => {
    const { embudo } = resumen

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-red-500/10 text-center">
            <p className="text-xs text-muted-foreground mb-1">Estancadas 30d</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{embudo.estancadas_30}</p>
          </div>
          <div className="p-3 rounded-lg bg-amber-500/10 text-center">
            <p className="text-xs text-muted-foreground mb-1">Estancadas 60d</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{embudo.estancadas_60}</p>
          </div>
          <div className="p-3 rounded-lg bg-red-500/10 text-center">
            <p className="text-xs text-muted-foreground mb-1">Estancadas 90d+</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{embudo.estancadas_90}</p>
          </div>
        </div>

        {/* Oportunidades por etapa */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Distribución por etapa</p>
          {embudo.por_etapa.map((etapa, idx) => (
            <div key={idx} className="p-3 rounded-lg border bg-card/50">
              <div className="flex items-center justify-between mb-1">
                <p className={cn(
                  'text-sm font-medium',
                  embudo.etapas_sospechosas.includes(etapa.etapa) && 'text-amber-600 dark:text-amber-400'
                )}>
                  {etapa.etapa}
                </p>
                <Badge variant="secondary">{etapa.cantidad}</Badge>
              </div>
              {etapa.esEtapaInicial && (
                <p className="text-xs text-muted-foreground">Pipeline: {etapa.pipeline}</p>
              )}
            </div>
          ))}
        </div>

        {/* Alertas */}
        {(embudo.duplicados_probables > 0 || embudo.inconsistencias_estado > 0 || embudo.etapas_iniciales_saturadas) && (
          <div className="space-y-2">
            {embudo.duplicados_probables > 0 && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  {embudo.duplicados_probables} duplicados probables
                </p>
              </div>
            )}
            {embudo.inconsistencias_estado > 0 && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  {embudo.inconsistencias_estado} inconsistencias de estado
                </p>
              </div>
            )}
            {embudo.etapas_iniciales_saturadas && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-600 dark:text-red-400">
                  Etapas iniciales saturadas
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const TabTiempos = () => {
    const { tiempos_respuesta } = resumen

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-card border">
            <p className="text-xs text-muted-foreground mb-1">1ª respuesta (promedio)</p>
            <p className="text-2xl font-bold">
              {tiempos_respuesta.promedio_primera_respuesta_min ?? 0}
              <span className="text-sm text-muted-foreground ml-1">min</span>
            </p>
          </div>
          <div className="p-4 rounded-lg bg-card border">
            <p className="text-xs text-muted-foreground mb-1">Handoff IA→humano</p>
            <p className="text-2xl font-bold">
              {tiempos_respuesta.promedio_handoff_min ?? 0}
              <span className="text-sm text-muted-foreground ml-1">min</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 rounded-lg border bg-card/50">
            <p className="text-xs text-muted-foreground mb-1">Handoffs detectados</p>
            <p className="text-lg font-bold">{tiempos_respuesta.handoffs_detectados}</p>
          </div>
          <div className="p-3 rounded-lg border bg-amber-500/10">
            <p className="text-xs text-muted-foreground mb-1">Handoffs sin tomar</p>
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
              {tiempos_respuesta.handoffs_sin_tomar}
            </p>
          </div>
        </div>

        <div className="text-xs text-muted-foreground p-3 rounded-lg bg-muted/30">
          <p><strong>Conversaciones muestreadas:</strong> {tiempos_respuesta.muestreadas}</p>
        </div>
      </div>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <span>{cliente.nombre_del_negocio}</span>
            <Badge variant="outline" className="text-xs">
              {new Date(ejecutado_en).toLocaleDateString('es-AR')}
            </Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Alert Banners */}
          <AlertaBanners />

          {/* Tabs */}
          <Tabs defaultValue="tareas" className="w-full">
            <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 h-auto">
              <TabsTrigger value="tareas" className="text-xs">
                <CheckCircle2 className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Tareas</span>
              </TabsTrigger>
              <TabsTrigger value="conversaciones" className="text-xs">
                <MessageSquare className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Conversaciones</span>
              </TabsTrigger>
              <TabsTrigger value="inbox" className="text-xs">
                <Inbox className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Inbox</span>
              </TabsTrigger>
              <TabsTrigger value="oportunidades" className="text-xs">
                <Target className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Oportunidades</span>
              </TabsTrigger>
              <TabsTrigger value="embudo" className="text-xs">
                <GitBranch className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Embudo</span>
              </TabsTrigger>
              <TabsTrigger value="tiempos" className="text-xs">
                <Clock className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Tiempos</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="tareas" className="mt-4">
              <TabTareas />
            </TabsContent>
            <TabsContent value="conversaciones" className="mt-4">
              <TabConversaciones />
            </TabsContent>
            <TabsContent value="inbox" className="mt-4">
              <TabInbox />
            </TabsContent>
            <TabsContent value="oportunidades" className="mt-4">
              <TabOportunidades />
            </TabsContent>
            <TabsContent value="embudo" className="mt-4">
              <TabEmbudo />
            </TabsContent>
            <TabsContent value="tiempos" className="mt-4">
              <TabTiempos />
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  )
}
