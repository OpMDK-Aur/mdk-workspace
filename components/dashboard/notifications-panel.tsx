'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { 
  Calendar, 
  CheckSquare, 
  MessageSquare, 
  TrendingDown, 
  AlertTriangle,
  X,
  Check,
  Archive,
  Settings,
  Filter
} from 'lucide-react'
import Link from 'next/link'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface Notificacion {
  id: string
  tipo: 'reunion' | 'tarea_vence' | 'comentario' | 'cpl_alerta' | 'impresiones_cero'
  titulo: string
  descripcion: string | null
  referencia_id: string | null
  referencia_tipo: string | null
  cliente_id: string | null
  leida: boolean
  created_at: string
  cliente?: {
    nombre_del_negocio: string
  } | null
}

interface NotificationsPanelProps {
  isOpen: boolean
  onClose: () => void
}

const TIPO_CONFIG: Record<string, { icon: typeof Calendar; color: string; label: string }> = {
  reunion: { icon: Calendar, color: 'text-blue-400', label: 'Reunión' },
  tarea_vence: { icon: CheckSquare, color: 'text-amber-400', label: 'Tarea' },
  comentario: { icon: MessageSquare, color: 'text-green-400', label: 'Comentario' },
  cpl_alerta: { icon: TrendingDown, color: 'text-red-400', label: 'CPL Alerta' },
  impresiones_cero: { icon: AlertTriangle, color: 'text-orange-400', label: 'Sin impresiones' },
}

function groupByDate(notifications: Notificacion[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)

  const groups: { label: string; items: Notificacion[] }[] = [
    { label: 'Hoy', items: [] },
    { label: 'Ayer', items: [] },
    { label: 'Esta semana', items: [] },
    { label: 'Anteriores', items: [] },
  ]

  notifications.forEach((n) => {
    const date = new Date(n.created_at)
    if (date >= today) {
      groups[0].items.push(n)
    } else if (date >= yesterday) {
      groups[1].items.push(n)
    } else if (date >= weekAgo) {
      groups[2].items.push(n)
    } else {
      groups[3].items.push(n)
    }
  })

  return groups.filter((g) => g.items.length > 0)
}

export function NotificationsPanel({ isOpen, onClose }: NotificationsPanelProps) {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'todas' | 'no_leidas'>('todas')

  useEffect(() => {
    if (isOpen) {
      loadNotificaciones()
    }
  }, [isOpen])

  async function loadNotificaciones() {
    const supabase = createClient()
    setLoading(true)

    const { data, error } = await supabase
      .from('notificaciones')
      .select(`
        *,
        cliente:cliente_id(nombre_del_negocio)
      `)
      .order('created_at', { ascending: false })
      .limit(50)

    if (!error && data) {
      setNotificaciones(data)
    }
    setLoading(false)
  }

  async function marcarLeida(id: string) {
    const supabase = createClient()
    await supabase
      .from('notificaciones')
      .update({ leida: true })
      .eq('id', id)

    setNotificaciones((prev) =>
      prev.map((n) => (n.id === id ? { ...n, leida: true } : n))
    )
  }

  async function marcarTodasLeidas() {
    const supabase = createClient()
    const ids = notificaciones.filter((n) => !n.leida).map((n) => n.id)
    
    if (ids.length === 0) return

    await supabase
      .from('notificaciones')
      .update({ leida: true })
      .in('id', ids)

    setNotificaciones((prev) =>
      prev.map((n) => ({ ...n, leida: true }))
    )
  }

  const filteredNotificaciones = filter === 'no_leidas' 
    ? notificaciones.filter((n) => !n.leida)
    : notificaciones

  const groupedNotificaciones = groupByDate(filteredNotificaciones)
  const unreadCount = notificaciones.filter((n) => !n.leida).length

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50" 
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className="relative ml-16 w-[380px] h-full bg-background border-r border-border flex flex-col animate-in slide-in-from-left duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Bandeja de entrada</h2>
            {unreadCount > 0 && (
              <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Filter className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setFilter('todas')}>
                  <Check className={cn("h-4 w-4 mr-2", filter !== 'todas' && "opacity-0")} />
                  Todas
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilter('no_leidas')}>
                  <Check className={cn("h-4 w-4 mr-2", filter !== 'no_leidas' && "opacity-0")} />
                  No leídas
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={marcarTodasLeidas}
              title="Marcar todas como leídas"
            >
              <Archive className="h-4 w-4" />
            </Button>
            <Link href="/dashboard/perfil">
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Configuración">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : groupedNotificaciones.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Archive className="h-12 w-12 mb-3 opacity-50" />
              <p className="text-sm">No hay notificaciones</p>
            </div>
          ) : (
            <div className="py-2">
              {groupedNotificaciones.map((group) => (
                <div key={group.label}>
                  <div className="px-4 py-2 text-xs font-medium text-muted-foreground sticky top-0 bg-background">
                    {group.label}
                  </div>
                  {group.items.map((notif) => {
                    const config = TIPO_CONFIG[notif.tipo] || TIPO_CONFIG.comentario
                    const Icon = config.icon

                    return (
                      <div
                        key={notif.id}
                        className={cn(
                          "px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors border-l-2",
                          notif.leida 
                            ? "border-l-transparent opacity-60" 
                            : "border-l-primary bg-muted/30"
                        )}
                        onClick={() => marcarLeida(notif.id)}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn("mt-0.5", config.color)}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium truncate">
                                {notif.titulo}
                              </p>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {formatDistanceToNow(new Date(notif.created_at), { 
                                  addSuffix: false, 
                                  locale: es 
                                })}
                              </span>
                            </div>
                            {notif.descripcion && (
                              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                                {notif.descripcion}
                              </p>
                            )}
                            {notif.cliente?.nombre_del_negocio && (
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <Avatar className="h-4 w-4">
                                  <AvatarFallback className="text-[8px]">
                                    {notif.cliente.nombre_del_negocio.slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-xs text-muted-foreground">
                                  {notif.cliente.nombre_del_negocio}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
