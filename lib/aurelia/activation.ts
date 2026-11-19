import type { SubscriptionStatus } from './metrics'

export type SubscriptionHistoryRow = {
  planName: string | null
  status: SubscriptionStatus
  rawStatus: string | null
  createdAt: string | null
  currentPeriodStart: string | null
  trialEndAt: string | null
  endedAt: string | null
  /** null cuando el plan no tiene un precio reconocible. */
  monthlyPrice: number | null
}

const ts = (value: string | null) => (value ? new Date(value).getTime() : Number.NaN)

/** Suscripción que llegó a cobrarse: no es prueba ni plan gratis, y si terminó, terminó después de la prueba. */
export function isPaidSubscription(row: SubscriptionHistoryRow, now = Date.now()): boolean {
  if (row.monthlyPrice === 0) return false
  if (row.status === 'trial' || row.status === 'other') return false
  if (row.status === 'active' || row.status === 'past_due') return true
  // Baja: solo cuenta si duró más que la prueba (una prueba vencida no es una activación).
  if (!row.trialEndAt) return Boolean(row.endedAt)
  return ts(row.endedAt) > ts(row.trialEndAt) && ts(row.trialEndAt) <= now
}

/** Si la suscripción tuvo prueba ya vencida, se activó al terminar la prueba; si no, al crearse. */
function activationOf(row: SubscriptionHistoryRow, now: number): string | null {
  const trialEnd = ts(row.trialEndAt)
  const created = ts(row.createdAt ?? row.currentPeriodStart)
  if (row.trialEndAt && trialEnd <= now && (Number.isNaN(created) || trialEnd >= created)) return row.trialEndAt
  return row.createdAt ?? row.currentPeriodStart
}

/**
 * Fecha estimada en que el cliente activó su plan actual: la de la suscripción
 * cobrada más reciente (`history` viene de la más nueva a la más vieja, igual
 * que el criterio del estado vigente). El CRM no guarda el cambio de estado,
 * así que si una misma suscripción pasó de prueba a activa sin fecha de fin de
 * prueba, se usa su fecha de creación.
 */
export function estimateActivation(history: SubscriptionHistoryRow[], now = Date.now()): string | null {
  for (const row of history) {
    if (!isPaidSubscription(row, now)) continue
    const activation = activationOf(row, now)
    if (activation && !Number.isNaN(ts(activation))) return activation
  }
  return null
}
