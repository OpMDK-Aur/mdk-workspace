import type { UserRole } from './types'

export function isMaster(role: UserRole | string) {
  return role === 'Master'
}

export function canEdit(role: UserRole | string) {
  return role === 'Master' || role === 'Usuario'
}

export function hasModule(modulos: string[] | null | undefined, modulo: string) {
  return modulos?.includes(modulo) ?? false
}

export function canSeeSection(
  role: UserRole | string,
  modulos: string[] | null | undefined,
  seccion: string
): boolean {
  if (role === 'Master') return true
  if (role === 'Lector') return hasModule(modulos, seccion)
  return hasModule(modulos, seccion)
}
