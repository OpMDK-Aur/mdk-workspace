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

const ERIKA_GORDILLO_ID = 'b9bc1549-a988-4ed1-b9af-a91ba611a7cf'
const AYELEN_SUAREZ_ID = '340d82eb-f257-4ec1-82d0-8291cb70ebad'

export const HITO_MANAGER_SELECT = 'project_manager_id, project_manager_ids, account_manager_id, account_manager_ids'

type ClientManagers = {
  project_manager_id?: string | null
  project_manager_ids?: string[] | null
  account_manager_id?: string | null
  account_manager_ids?: string[] | null
}

function managerSet(single?: string | null, many?: string[] | null): Set<string> {
  const ids = new Set<string>(many?.filter(Boolean) ?? [])
  if (single) ids.add(single)
  return ids
}

// Business rule: no automatic [Hito] tasks for clients managed by Erika Gordillo (PM)
// or whose only account manager is Ayelén Suárez.
export function isExcludedFromHitos(cliente: ClientManagers | null | undefined): boolean {
  if (!cliente) return true
  const pms = managerSet(cliente.project_manager_id, cliente.project_manager_ids)
  if (pms.has(ERIKA_GORDILLO_ID)) return true
  const ams = managerSet(cliente.account_manager_id, cliente.account_manager_ids)
  return ams.size === 1 && ams.has(AYELEN_SUAREZ_ID)
}

export function canGenerateHitos(cliente: (ClientActivity & ClientManagers) | null | undefined): boolean {
  return isClientActive(cliente) && !isExcludedFromHitos(cliente)
}
