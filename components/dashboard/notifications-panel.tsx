'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
  Check,
  Archive,
  Settings,
  Filter,
  ChevronLeft,
  Inbox,
  Trash2,
  RefreshCw,
  UserPlus
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
  tipo: 'reunion' | 'tarea_vence' | 'tarea_hoy' | 'comentario' | 'cpl_alerta' | 'impresiones_cero' | 'mencion' | 'tarea_resuelta' | 'asignado_a_tarea' | 'fecha_cambiada' | 'cliente_agregado'
  titulo: string
  descripcion: string | null
  referencia_id: string | null
  referencia_tipo: string | null
  cliente_id: string | null
  leida: boolean
  created_at: string
}

interface NotificationsPanelProps {
  onClose: () => void
}

const TIPO_CONFIG: Record<string, { icon: typeof Calendar; color: string; bgColor: string; label: string }> = {
  reunion:          { icon: Calendar,      color: 'text-blue-400',    bgColor: 'bg-blue-500/10',    label: 'Reunión' },
  tarea_vence:      { icon: CheckSquare,   color: 'text-red-400',     bgColor: 'bg-red-500/10',     label: 'Tarea Vencida' },
  tarea_hoy:        { icon: CheckSquare,   color: 'text-amber-400',   bgColor: 'bg-amber-500/10',   label: 'Tarea Hoy' },
  comentario:       { icon: MessageSquare, color: 'text-green-400',   bgColor: 'bg-green-500/10',   label: 'Nueva tarea' },
  mencion:          { icon: MessageSquare, color: 'text-cyan-400',    bgColor: 'bg-cyan-500/10',    label: 'Mención' },
  tarea_resuelta:   { icon: CheckSquare,   color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', label: 'Resuelta' },
  asignado_a_tarea: { icon: CheckSquare,   color: 'text-blue-400',    bgColor: 'bg-blue-500/10',    label: 'Asignado' },
  fecha_cambiada:   { icon: Calendar,      color: 'text-amber-400',   bgColor: 'bg-amber-500/10',   label: 'Fecha cambiada' },
  cliente_agregado: { icon: MessageSquare, color: 'text-violet-400',  bgColor: 'bg-violet-500/10',  label: 'Cliente agregado' },
  cpl_alerta:       { icon: TrendingDown,  color: 'text-red-400',     bgColor: 'bg-red-500/10',     label: 'CPL Alerta' },
  impresiones_cero: { icon: AlertTriangle, color: 'text-orange-400',  bgColor: 'bg-orange-500/10',  label: 'Sin impresiones' },
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

export function NotificationsPanel({ onClose }: NotificationsPanelProps) {
  const router = useRouter()
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'todas' | 'no_leidas'>('todas')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    // Get current user, generate notifications, then load
    async function init() {
      const supabase = createClient()
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }
      
      // Get colaborador_id from user email
      const { data: colaborador } = await supabase
        .from('colaboradores')
        .select('id')
        .eq('email', user.email)
        .single()
      
      if (!colaborador) {
        setLoading(false)
        return
      }
      
      setCurrentUserId(colaborador.id)
      
      // Generate fresh notifications for overdue and today tasks
      try {
        await fetch('/api/notifications/generate', { method: 'POST' })
      } catch {
        // Silently fail, still load existing notifications
      }
      
      loadNotificaciones(colaborador.id)
    }
    init()
  }, [])

  async function loadNotificaciones(userId: string) {
    const supabase = createClient()
    setLoading(true)

    const { data, error } = await supabase
      .from('notificaciones')
      .select('*')
      .eq('colaborador_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (!error && data) {
      setNotificaciones(data)
    }
    setLoading(false)
  }

  async function marcarLeida(id: string) {
    if (!currentUserId) return
    const supabase = createClient()
    await supabase
      .from('notificaciones')
      .update({ leida: true })
      .eq('id', id)
      .eq('colaborador_id', currentUserId)

    setNotificaciones((prev) =>
      prev.map((n) => (n.id === id ? { ...n, leida: true } : n))
    )
  }

  async function marcarTodasLeidas() {
    if (!currentUserId) return
    const supabase = createClient()
    const ids = notificaciones.filter((n) => !n.leida).map((n) => n.id)
    
    if (ids.length === 0) return

    await supabase
      .from('notificaciones')
      .update({ leida: true })
      .in('id', ids)
      .eq('colaborador_id', currentUserId)

    setNotificaciones((prev) =>
      prev.map((n) => ({ ...n, leida: true }))
    )
  }

  async function limpiarYRegenerar() {
    if (!currentUserId) return
    setLoading(true)
    
    // Only delete tarea_vence notifications, preserve task assignment notifications
    await supabase
      .from('notificaciones')
      .delete()
      .eq('colaborador_id', currentUserId)
      .eq('tipo', 'tarea_vence')
    
    // Generate fresh notifications
    await fetch('/api/notifications/generate', { method: 'POST' })
    
    // Reload
    loadNotificaciones(currentUserId)
  }

  function handleNotificationClick(notif: Notificacion) {
    marcarLeida(notif.id)
    
    // Navigate to task if it's a task-related notification
    if (notif.referencia_tipo === 'tarea' && notif.referencia_id) {
      onClose()
      router.push(`/dashboard/tasks?task=${notif.referencia_id}`)
    }
  }

  const filteredNotificaciones = filter === 'no_leidas' 
    ? notificaciones.filter((n) => !n.leida)
    : notificaciones

  const groupedNotificaciones = groupByDate(filteredNotificaciones)
  const unreadCount = notificaciones.filter((n) => !n.leida).length

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8"
          onClick={onClose}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 flex-1">
          <Inbox className="h-4 w-4" />
          <span className="font-medium text-sm">Bandeja de entrada</span>
          {unreadCount > 0 && (
            <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border text-xs text-muted-foreground shrink-0">
        <span>{filter === 'todas' ? 'Todas' : 'No leídas'}</span>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7"
            onClick={marcarTodasLeidas}
            title="Marcar todas como leídas"
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7"
            onClick={marcarTodasLeidas}
            title="Archivar leídas"
          >
            <Archive className="h-3.5 w-3.5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7"
            onClick={limpiarYRegenerar}
            title="Limpiar y regenerar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Filter className="h-3.5 w-3.5" />
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
          <Link href="/dashboard/perfil">
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Configuración">
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Content — flex-1 + min-h-0 lets this shrink inside the flex column so scroll works */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : groupedNotificaciones.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Archive className="h-10 w-10 mb-3 opacity-50" />
            <p className="text-sm">No hay notificaciones</p>
          </div>
        ) : (
          <div className="py-1">
            {groupedNotificaciones.map((group) => (
              <div key={group.label}>
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground sticky top-0 bg-card">
                  {group.label}
                </div>
                {group.items.map((notif) => {
                  const isTareaAsignada = notif.titulo === 'Nueva tarea'
                  const config = isTareaAsignada
                    ? { icon: UserPlus, color: 'text-violet-400', bgColor: 'bg-violet-500/10', label: 'Tarea asignada' }
                    : TIPO_CONFIG[notif.tipo] || TIPO_CONFIG.comentario
                  const Icon = config.icon

                  return (
                    <div
                      key={notif.id}
                      className={cn(
                        "w-full px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors overflow-hidden",
                        !notif.leida && "bg-muted/30"
                      )}
                      onClick={() => handleNotificationClick(notif)}
                    >
                      <div className="flex items-start gap-2">
                        <Avatar className={cn("h-6 w-6 shrink-0 mt-0.5", config.bgColor)}>
                          <AvatarFallback className={cn("text-[10px]", config.color)}>
                            <Icon className="h-3 w-3" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <div className="flex flex-col gap-0.5">
                            <p className={cn(
                              "text-xs leading-snug break-words",
                              !notif.leida && "font-medium"
                            )}>
                              {notif.titulo}
                            </p>
                            <div className="flex items-center justify-between gap-1.5">
                              {notif.descripcion && (
                                <p className="text-[11px] text-muted-foreground line-clamp-1 flex-1 min-w-0">
                                  {notif.descripcion}
                                </p>
                              )}
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  {formatDistanceToNow(new Date(notif.created_at), { 
                                    addSuffix: false, 
                                    locale: es 
                                  })}
                                </span>
                                {!notif.leida && (
                                  <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                                )}
                              </div>
                            </div>
                            {notif.cliente?.nombre_del_negocio && (
                              <span className="text-[10px] text-muted-foreground">
                                {notif.cliente.nombre_del_negocio}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
