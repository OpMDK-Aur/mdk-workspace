'use client'

import type { ActivityLog } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Circle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ActivityFeedProps {
  activities: ActivityLog[]
}

// Mock activities for display
const mockActivities = [
  {
    id: '1',
    title: 'Reporte mensual Mundos E generado por IA',
    time: 'Hoy · 10:42',
    type: 'report' as const,
  },
  {
    id: '2',
    title: 'Alerta: Delta Group bajó umbral ROAS',
    time: 'Hoy · 09:15',
    type: 'alert' as const,
  },
  {
    id: '3',
    title: 'SOP de optimización actualizado',
    time: 'Ayer · 17:30',
    type: 'update' as const,
  },
  {
    id: '4',
    title: 'Campaña nueva creada para ADT',
    time: 'Ayer · 14:20',
    type: 'campaign' as const,
  },
  {
    id: '5',
    title: 'Análisis de competencia completado',
    time: '2 días · 11:00',
    type: 'analysis' as const,
  },
]

function getActivityColor(type: string) {
  switch (type) {
    case 'report':
      return 'bg-primary'
    case 'alert':
      return 'bg-status-naranja'
    case 'update':
      return 'bg-status-verde'
    case 'campaign':
      return 'bg-status-amarillo'
    default:
      return 'bg-muted-foreground'
  }
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  const displayActivities = activities.length > 0 
    ? activities.map(a => ({
        id: a.id,
        title: a.description || a.action,
        time: new Date(a.created_at).toLocaleString('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        type: 'update' as const,
      }))
    : mockActivities

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Actividad reciente</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[280px] px-6">
          <div className="space-y-4 pb-4">
            {displayActivities.map((activity, index) => (
              <div 
                key={activity.id} 
                className={cn(
                  'relative pl-6',
                  index !== displayActivities.length - 1 && 'pb-4 border-l border-border ml-1.5'
                )}
              >
                <Circle 
                  className={cn(
                    'absolute -left-1.5 top-0.5 h-3 w-3 fill-current',
                    getActivityColor(activity.type)
                  )} 
                />
                <div className="ml-2">
                  <p className="text-sm font-medium leading-tight">{activity.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
