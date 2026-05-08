'use client'

import type { Client } from '@/lib/types'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Phone, User, Circle, ExternalLink, NotebookText, Hash } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { DiscordChat } from './discord-chat'

interface ClientPanelProps {
  client: Client | null
  onClose: () => void
}

function getStatusInfo(status: string | null) {
  switch (status) {
    case 'verde':
      return { label: 'Optimo', className: 'bg-status-verde/10 text-status-verde border-status-verde/25', dotClass: 'bg-status-verde', description: 'El cliente se encuentra en estado optimo. Todas las metricas dentro del objetivo.' }
    case 'amarillo':
      return { label: 'Atencion', className: 'bg-status-amarillo/10 text-status-amarillo border-status-amarillo/25', dotClass: 'bg-status-amarillo', description: 'Algunas metricas requieren atencion. Revisar campanas activas.' }
    case 'naranja':
      return { label: 'Alerta', className: 'bg-status-naranja/10 text-status-naranja border-status-naranja/25', dotClass: 'bg-status-naranja', description: 'El cliente presenta alertas criticas. Tomar accion inmediata.' }
    case 'rojo':
      return { label: 'Critico', className: 'bg-status-rojo/10 text-status-rojo border-status-rojo/25', dotClass: 'bg-status-rojo', description: 'Estado critico. Requiere intervencion urgente.' }
    default:
      return { label: 'Sin estado', className: 'bg-muted text-muted-foreground', dotClass: 'bg-muted-foreground', description: 'Sin informacion de estado disponible.' }
  }
}

function getPlanBadgeClass(plan: string) {
  switch (plan) {
    case 'Premium': return 'bg-primary/10 text-primary border-primary/25'
    case 'Estrategico': return 'bg-status-verde/10 text-status-verde border-status-verde/25'
    case 'Esencial': return 'bg-muted text-muted-foreground'
    default: return 'bg-muted text-muted-foreground'
  }
}

function formatCurrency(value: number | null): string {
  if (!value) return '-'
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`
  if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`
  return `$${value.toFixed(2)}`
}

export function ClientPanel({ client, onClose }: ClientPanelProps) {
  if (!client) return null

  const status = getStatusInfo(client.status)
  const initials = client.business_name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const hasContact = client.nombre || client.telefono

  return (
    <Sheet open={!!client} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-sm p-0 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14 shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-lg">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold leading-tight truncate">{client.business_name}</h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge variant="outline" className={cn('text-xs font-medium', getPlanBadgeClass(client.plan))}>
                  {client.plan}
                </Badge>
                <Badge variant="outline" className={cn('text-xs font-medium', status.className)}>
                  <Circle className={cn('h-1.5 w-1.5 fill-current mr-1', status.dotClass)} />
                  {status.label}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status description */}
          <div className={cn('rounded-xl border px-4 py-3 text-sm', status.className)}>
            <p className="font-medium mb-0.5">Estado: {status.label}</p>
            <p className="text-xs opacity-80">{status.description}</p>
          </div>

          {/* Contact */}
          {hasContact && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Contacto
              </h3>
              <div className="space-y-2">
                {client.nombre && (
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Nombre</p>
                      <p className="text-sm font-medium">
                        {client.nombre} {client.apellido || ''}
                      </p>
                    </div>
                  </div>
                )}
                {client.telefono && (
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Telefono</p>
                      <a
                        href={`tel:${client.telefono}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {client.telefono}
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Discord */}
          {(client.discord_channel_name || client.discord_channel_id) && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Discord
              </h3>
              {client.discord_channel_id ? (
                <DiscordChat 
                  channelId={client.discord_channel_id} 
                  channelName={client.discord_channel_name || 'canal'} 
                />
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-[#5865F2]/10 border border-[#5865F2]/20">
                  <div className="h-8 w-8 rounded-lg bg-[#5865F2] flex items-center justify-center shrink-0">
                    <Hash className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Canal</p>
                    <p className="text-sm font-medium text-foreground truncate">
                      {client.discord_channel_name}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      Agrega el Channel ID para habilitar el chat
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Fee info */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Facturacion
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/50 border border-border p-3">
                <p className="text-xs text-muted-foreground mb-1">Fee MDK</p>
                <p className="text-base font-semibold">{formatCurrency(client.fee_mdk)}</p>
              </div>
              {client.fee_aurelia && (
                <div className="rounded-xl bg-muted/50 border border-border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Fee Aurelia</p>
                  <p className="text-base font-semibold">{formatCurrency(client.fee_aurelia)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Notion — coming soon */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Historial (Notion)
            </h3>
            {client.notion_id ? (
              <Button
                variant="outline"
                className="w-full gap-2 justify-start"
                asChild
              >
                <a
                  href={`https://notion.so/${client.notion_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <NotebookText className="h-4 w-4" />
                  Ver en Notion
                  <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
                </a>
              </Button>
            ) : (
              <div className="rounded-xl border-2 border-dashed border-border p-4 text-center">
                <NotebookText className="h-5 w-5 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">Conexion con Notion proxima</p>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                  Aqui se mostraran metricas historicas y el estado del cliente.
                </p>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
