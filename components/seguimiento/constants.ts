import type { SeguimientoGrupo, SeguimientoItem } from '@/lib/tasks/seguimiento-match'

export const GRUPO_ORDER: SeguimientoGrupo[] = ['urgente', 'semana', 'recurrente', 'depende_cliente', 'tarjetas']

// The stored grupo is a starting point: open items due today or earlier are always shown
// as urgent, and "urgente" items whose date moved to the future fall back to the week.
export function effectiveGrupo(item: SeguimientoItem, today: string): SeguimientoGrupo {
  const due = item.fecha_vencimiento
  if (!item.completado && due && due <= today) return 'urgente'
  if (item.grupo === 'onboarding') return 'semana'
  if (item.grupo === 'urgente' && due && due > today) return 'semana'
  return item.grupo
}

export const GRUPO_LABELS: Record<SeguimientoGrupo, string> = {
  urgente: 'Vencidas o para hoy',
  semana: 'Esta semana',
  recurrente: 'Recurrentes',
  depende_cliente: 'Dependen del cliente',
  onboarding: 'Clientes en onboarding AURELIA CRM',
  tarjetas: 'Actualizar tarjetas de clientes',
}

export const PRIORIDAD_STYLES = {
  alta: { label: 'Alta', className: 'bg-mdk-pink/15 text-mdk-pink' },
  media: { label: 'Media', className: 'bg-mdk-orange/15 text-mdk-orange' },
  baja: { label: 'Baja', className: 'bg-muted text-muted-foreground' },
} as const

export const PRIORIDAD_RANK = { alta: 0, media: 1, baja: 2 } as const

export function motivationalMessage(pct: number) {
  if (pct === 0) return 'Arrancá por las urgentes: son las que más mueven la aguja esta semana.'
  if (pct < 50) return 'Buen ritmo. Seguí con las de prioridad alta y la semana sale sola.'
  if (pct < 100) return 'Ya pasaste la mitad. Cerrá la semana con todo.'
  return 'Semana cerrada. Excelente trabajo.'
}
