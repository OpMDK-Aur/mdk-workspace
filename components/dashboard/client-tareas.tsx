'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Loader2, CheckCircle2, Clock, AlertCircle, Circle, 
  ArrowRight, Calendar, User
} from 'lucide-react'
import { format, isPast, isToday } from 'date-fns'
import { es } from 'date-fns/locale'

interface Tarea {
  id: string
  titulo: string
  descripcion: string | null
  estado: string
  prioridad: string
  fecha_vencimiento: string | null
  asignado_a: string | null
  colaborador?: {
    nombre: string
    apellido: string
  } | null
}

interface ClientTareasProps {
  clientId: string
  onTaskClick?: (taskId: string) => void
}

const ESTADOS = [
  { value: 'pendiente', label: 'Pendientes', icon: Circle, color: 'text-gray-500' },
  { value: 'en_progreso', label: 'En Progreso', icon: Clock, color: 'text-blue-500' },
  { value: 'revision', label: 'En Revision', icon: AlertCircle, color: 'text-orange-500' },
  { value: 'completada', label: 'Completadas', icon: CheckCircle2, color: 'text-green-500' },
]

const PRIORIDADES: Record<string, { label: string; color: string }> = {
  baja: { label: 'Baja', color: 'bg-slate-500' },
  media: { label: 'Media', color: 'bg-blue-500' },
  alta: { label: 'Alta', color: 'bg-orange-500' },
  urgente: { label: 'Urgente', color: 'bg-red-500' },
}

export function ClientTareas({ clientId, onTaskClick }: ClientTareasProps) {
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('pendiente')

  const supabase = createClient()
  const router = useRouter()

  // Navigate to the task in the tasks board (deep-link via ?task=<id>),
  // unless a custom handler is provided.
  const handleTaskClick = (taskId: string) => {
    if (onTaskClick) {
      onTaskClick(taskId)
    } else {
      router.push(`/dashboard/tasks?task=${taskId}`)
    }
  }

  useEffect(() => {
    fetchTareas()
  }, [clientId])

  const fetchTareas = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('tareas')
      .select(`
        id,
        titulo,
        descripcion,
        estado,
        prioridad,
        fecha_vencimiento,
        asignado_a,
        colaboradores:asignado_a(nombre, apellido)
      `)
      .eq('cliente_id', clientId)
      .order('fecha_vencimiento', { ascending: true, nullsFirst: false })

    if (error) {
      console.log('[v0] Error fetching tareas:', error)
    }
    
    if (data) {
      // Map colaboradores to colaborador for consistency
      const mapped = data.map(t => ({
        ...t,
        colaborador: t.colaboradores
      }))
      setTareas(mapped as Tarea[])
    }
    setLoading(false)
  }

  const getTareasByEstado = (estado: string) => {
    return tareas.filter(t => t.estado === estado)
  }

  const getCountByEstado = (estado: string) => {
    return tareas.filter(t => t.estado === estado).length
  }

  const isOverdue = (fecha: string | null) => {
    if (!fecha) return false
    return isPast(new Date(fecha)) && !isToday(new Date(fecha))
  }

  const renderTarea = (tarea: Tarea) => {
    const prioridad = PRIORIDADES[tarea.prioridad] || PRIORIDADES.media
    const overdue = isOverdue(tarea.fecha_vencimiento)

    return (
      <div
        key={tarea.id}
        className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer group"
        onClick={() => handleTaskClick(tarea.id)}
      >
        <div className={`w-1 h-full min-h-[40px] rounded-full ${prioridad.color}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{tarea.titulo}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {tarea.fecha_vencimiento && (
              <div className={`flex items-center gap-1 text-xs ${overdue ? 'text-red-500' : 'text-muted-foreground'}`}>
                <Calendar className="h-3 w-3" />
                <span>
                  {isToday(new Date(tarea.fecha_vencimiento)) 
                    ? 'Hoy' 
                    : format(new Date(tarea.fecha_vencimiento), 'dd MMM', { locale: es })}
                </span>
              </div>
            )}
            {tarea.colaborador && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <User className="h-3 w-3" />
                <span>{tarea.colaborador.nombre}</span>
              </div>
            )}
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${prioridad.color} text-white border-0`}>
              {prioridad.label}
            </Badge>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Tareas
        </h3>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Tareas ({tareas.length})
        </h3>
      </div>

      {tareas.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Sin tareas asignadas</p>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-4 h-9 mb-4">
            {ESTADOS.map(estado => {
              const count = getCountByEstado(estado.value)
              return (
                <TabsTrigger 
                  key={estado.value} 
                  value={estado.value}
                  className="text-xs px-1.5 sm:px-2 gap-1 min-w-0"
                >
                  <estado.icon className={`h-3 w-3 ${estado.color} shrink-0`} />
                  <span className="hidden sm:inline truncate">{estado.label.split(' ')[0]}</span>
                  {count > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-1">
                      {count}
                    </Badge>
                  )}
                </TabsTrigger>
              )
            })}
          </TabsList>

          {ESTADOS.map(estado => (
            <TabsContent key={estado.value} value={estado.value} className="mt-0">
              {getTareasByEstado(estado.value).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Sin tareas {estado.label.toLowerCase()}
                </p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {getTareasByEstado(estado.value).map(tarea => renderTarea(tarea))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}
