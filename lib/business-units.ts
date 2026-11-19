export type BusinessUnit = 'MDK' | 'Aurelia'

export const BUSINESS_UNITS: BusinessUnit[] = ['MDK', 'Aurelia']

export type UnitAccess = { mdk: boolean; aurelia: boolean }

export const AURELIA_HOME = '/dashboard/aurelia'
export const MDK_HOME = '/dashboard/conexa'

/**
 * Master ve todo. El resto ve las unidades de `colaboradores.unidades_negocio`;
 * si la columna todavía no existe o está vacía, se asume MDK para no cortar el
 * acceso de nadie.
 */
export function resolveUnitAccess(roleName: string | null | undefined, unidades: string[] | null | undefined): UnitAccess {
  if (roleName === 'Master') return { mdk: true, aurelia: true }
  const units = unidades?.length ? unidades : ['MDK']
  return { mdk: units.includes('MDK'), aurelia: units.includes('Aurelia') }
}

const SHARED_PATHS = ['/dashboard/perfil']

export function isDashboardPathAllowed(pathname: string, access: UnitAccess): boolean {
  if (SHARED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return true
  const isAureliaPath = pathname === AURELIA_HOME || pathname.startsWith(`${AURELIA_HOME}/`)
  return isAureliaPath ? access.aurelia : access.mdk
}

export function homeForAccess(access: UnitAccess) {
  return access.mdk ? MDK_HOME : AURELIA_HOME
}
