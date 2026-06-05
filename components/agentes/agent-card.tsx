'use client'

import { useState } from 'react'
import type { AgentConfig, AgentLog, Profile } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AgentConfigSheet } from './agent-config-sheet'
import { 
  FileText, 
  Radar, 
  Plug, 
  Pencil, 
  ListChecks,
  Settings,
  Play,
  Eye
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileAnalytics: FileText,
  Radar: Radar,
  Plug: Plug,
  Pencil: Pencil,
  ListCheck: ListChecks,
}

interface AgentCardProps {
  agente: AgentConfig
  lastLog: AgentLog | null
  onRun: (slug: string) => void
  profile: Profile | null
}

export function AgentCard({ agente, lastLog, onRun, profile }: AgentCardProps) {
  const [configOpen, setConfigOpen] = useState(false)
  const [logPanelOpen, setLogPanelOpen] = useState(false)

  const IconComponent = ICON_MAP[agente.icono || ''] || FileText
  const isMaster = profile?.role === 'Master' || profile?.role_name === 'Master'
  const isAutomatic = agente.trigger_type === 'cron_diario' || agente.trigger_type === 'cron_semanal'

  // Determine status indicator color
  let statusColor = 'bg-yellow-500' // No logs = yellow
  if (lastLog) {
    if (lastLog.estado === 'ok') statusColor = 'bg-green-500'
    else if (lastLog.estado === 'error') statusColor = 'bg-red-500'
    else if (lastLog.estado === 'parcial') statusColor = 'bg-yellow-500'
  }

  // Format last run text
  let lastRunText = 'Nunca ejecutado'
  if (lastLog) {
    const timeAgo = formatDistanceToNow(new Date(lastLog.ejecutado_en), { 
      addSuffix: false, 
      locale: es 
    })
    const clientCount = lastLog.clientes_auditados || 0
    lastRunText = `Hace ${timeAgo} · ${clientCount} cliente${clientCount !== 1 ? 's' : ''}`
  }

  // Trigger badge text
  const triggerText = agente.trigger_type === 'cron_diario' 
    ? 'Automatico · diario'
    : agente.trigger_type === 'cron_semanal'
    ? 'Automatico · semanal'
    : 'Manual'

  const triggerColor = isAutomatic 
    ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
    : 'bg-teal-500/10 text-teal-400 border-teal-500/30'

  return (
    <>
      <div 
        className={cn(
          'relative rounded-xl border bg-card p-4 transition-all duration-200',
          'hover:border-[#7F77DD]/50 hover:shadow-lg hover:shadow-[#7F77DD]/5'
        )}
      >
        {/* Status indicator */}
        <div className={cn('absolute top-3 right-3 h-2.5 w-2.5 rounded-full', statusColor)} />

        {/* Icon */}
        <div className="mb-3 inline-flex p-2.5 rounded-lg bg-[#EEEDFE]">
          <IconComponent className="h-5 w-5 text-[#7F77DD]" />
        </div>

        {/* Trigger badge */}
        <Badge variant="outline" className={cn('mb-2', triggerColor)}>
          {triggerText}
        </Badge>

        {/* Name and description */}
        <h3 className="font-semibold text-lg mb-1">{agente.nombre}</h3>
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
          {agente.descripcion}
        </p>

        {/* Last run info */}
        <p className="text-xs text-muted-foreground mb-4">
          {lastRunText}
        </p>

        {/* Alert badge for Controller */}
        {agente.slug === 'controller' && lastLog && lastLog.alertas_generadas > 0 && (
          <Badge variant="destructive" className="mb-3">
            {lastLog.alertas_generadas} alerta{lastLog.alertas_generadas !== 1 ? 's' : ''}
          </Badge>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {isAutomatic ? (
            <Button 
              variant="outline" 
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => setLogPanelOpen(true)}
            >
              <Eye className="h-4 w-4" />
              Ver ultimo reporte
            </Button>
          ) : (
            <Button 
              size="sm"
              className="flex-1 gap-1.5 bg-[#7F77DD] hover:bg-[#6B63C7]"
              onClick={() => onRun(agente.slug)}
            >
              <Play className="h-4 w-4" />
              Ejecutar
            </Button>
          )}

          {isMaster && (
            <Button 
              variant="ghost" 
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setConfigOpen(true)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Config Sheet */}
      <AgentConfigSheet 
        open={configOpen} 
        onOpenChange={setConfigOpen}
        agente={agente}
      />
    </>
  )
}
