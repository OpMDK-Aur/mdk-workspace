type ClientActivity = {
  activo?: boolean | null
  fecha_baja?: string | null
}

export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10)
}

// A client whose fecha_baja already passed is inactive even if nobody unchecked `activo`.
export function isClientActive(cliente: ClientActivity | null | undefined): boolean {
  if (!cliente) return false
  if (cliente.activo === false) return false
  if (cliente.fecha_baja && cliente.fecha_baja.slice(0, 10) <= todayISODate()) return false
  return true
}
