'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { X, Bell, MessageSquare, CheckSquare, UserPlus } from 'lucide-react'

interface NotificationAlert {
  id: string
  tipo: string
  titulo: string
  descripcion: string | null
  referencia_id: string | null
  referencia_tipo: string | null
}

const TIPO_ICONS: Record<string, typeof Bell> = {
  mencion: MessageSquare,
  comentario: UserPlus, // Used for "Nueva tarea asignada"
}

// Only show real-time alerts for these notification types
const ALERT_TYPES = ['mencion', 'comentario']

// Play notification sound
function playNotificationSound() {
  try {
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    
    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    
    // Pleasant notification tone
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1)
    oscillator.type = 'sine'
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)
    
    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.3)
  } catch {
    // Silently fail if audio context is not available
  }
}

export function NotificationAlertProvider() {
  const router = useRouter()
  const [alerts, setAlerts] = useState<NotificationAlert[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Get current user on mount
  useEffect(() => {
    async function getUser() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) {
        const { data: colaborador } = await supabase
          .from('colaboradores')
          .select('id')
          .eq('email', user.email)
          .single()
        if (colaborador) {
          setCurrentUserId(colaborador.id)
        }
      }
    }
    getUser()
  }, [])

  // Subscribe to new notifications (real-time)
  useEffect(() => {
    if (!currentUserId) return

    const supabase = createClient()
    
    const channel = supabase
      .channel('notification-alerts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificaciones',
          filter: `colaborador_id=eq.${currentUserId}`,
        },
        (payload) => {
          const newNotif = payload.new as NotificationAlert
          
          // Only show real-time alerts for mentions and task assignments
          if (!ALERT_TYPES.includes(newNotif.tipo)) {
            return
          }
          
          setAlerts((prev) => [...prev, newNotif])
          
          // Play notification sound
          playNotificationSound()
          
          // Auto-dismiss after 15 seconds
          setTimeout(() => {
            setAlerts((prev) => prev.filter((a) => a.id !== newNotif.id))
          }, 15000)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUserId])

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const handleClick = useCallback((alert: NotificationAlert) => {
    dismissAlert(alert.id)
    if (alert.referencia_tipo === 'tarea' && alert.referencia_id) {
      router.push(`/dashboard/tasks?task=${alert.referencia_id}`)
    }
  }, [dismissAlert, router])

  if (alerts.length === 0) return null

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 max-w-sm">
      {alerts.map((alert) => {
        const Icon = TIPO_ICONS[alert.tipo] || Bell
        return (
          <div
            key={alert.id}
            className={cn(
              'flex items-start gap-3 p-4 rounded-lg shadow-lg border cursor-pointer',
              'bg-card text-card-foreground border-border',
              'animate-in slide-in-from-left-full duration-300',
              'hover:bg-muted transition-colors'
            )}
            onClick={() => handleClick(alert)}
          >
            <div className={cn(
              'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
              alert.tipo === 'mencion' && 'bg-cyan-500/20 text-cyan-400',
              alert.tipo === 'comentario' && 'bg-green-500/20 text-green-400',
              !['mencion', 'comentario'].includes(alert.tipo) && 'bg-primary/20 text-primary'
            )}>
              <Icon className="w-4 h-4" />
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-tight">{alert.titulo}</p>
              {alert.descripcion && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {alert.descripcion}
                </p>
              )}
            </div>
            
            <button
              onClick={(e) => {
                e.stopPropagation()
                dismissAlert(alert.id)
              }}
              className="flex-shrink-0 p-1 rounded hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
