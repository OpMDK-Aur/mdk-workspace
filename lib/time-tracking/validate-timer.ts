export type TimerField = 'description' | 'tipo' | 'cliente'

export const TIMER_FIELD_LABELS: Record<TimerField, string> = {
  description: 'descripción',
  tipo: 'tipo de tarea',
  cliente: 'cliente',
}

export const TIMER_MISSING_FIELDS_ERROR = 'TIMER_MISSING_FIELDS'

export class TimerValidationError extends Error {
  missing: TimerField[]
  constructor(missing: TimerField[]) {
    super(TIMER_MISSING_FIELDS_ERROR)
    this.missing = missing
  }
}

export function getMissingTimerFields(input: {
  description: string | null | undefined
  tipoTareaId: string | null | undefined
  clientId: string | null | undefined
}): TimerField[] {
  const missing: TimerField[] = []
  if (!input.description?.trim()) missing.push('description')
  if (!input.tipoTareaId) missing.push('tipo')
  if (!input.clientId) missing.push('cliente')
  return missing
}

export function formatMissingTimerFields(missing: TimerField[]): string {
  return `Para iniciar el timer completá: ${missing.map((f) => TIMER_FIELD_LABELS[f]).join(', ')}`
}
