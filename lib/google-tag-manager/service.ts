import { google } from 'googleapis'

export type TagManagerAccountSummary = { accountId: string; accountName: string; containerId: string; containerName: string; publicId: string }

function getTagManagerClient() {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN })
  return google.tagmanager({ version: 'v2', auth })
}

// La Tag Manager API aplica una cuota MUY estricta de "Queries per minute
// per user" (compartida por todos los métodos del servicio: accounts.list,
// containers.list, workspaces.list, tags.list, triggers.list,
// variables.list). Todas las llamadas a la API, sin importar desde qué
// función se originen, pasan por `throttledTagManagerRequest`, que las
// serializa con un espaciado mínimo entre sí y reintenta con backoff
// exponencial si de todas formas llegamos a superar la cuota (429 /
// RESOURCE_EXHAUSTED). Esto reemplaza cualquier `Promise.all` de llamadas
// directas a la API: la concurrencia a nivel de código sigue existiendo,
// pero las solicitudes reales a Google quedan en fila una por una.
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
let requestQueueTail: Promise<unknown> = Promise.resolve()
let lastRequestAt = 0
const MIN_REQUEST_INTERVAL_MS = 1500 // ~40 solicitudes/minuto como techo global, por debajo de la cuota por defecto de Google
const MAX_RETRIES_ON_QUOTA_ERROR = 4

function isQuotaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /quota|rate limit|too many requests|429|RESOURCE_EXHAUSTED/i.test(message)
}

async function throttledTagManagerRequest<T>(fn: () => Promise<T>): Promise<T> {
  // Encola esta llamada detrás de todas las anteriores para que las
  // solicitudes a Google salgan de una en una, espaciadas.
  const runAfterQueue = requestQueueTail.then(async () => {
    const waitMs = Math.max(0, lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now())
    if (waitMs > 0) await sleep(waitMs)
    lastRequestAt = Date.now()
  })
  requestQueueTail = runAfterQueue.catch(() => undefined)
  await runAfterQueue

  for (let attempt = 0; attempt <= MAX_RETRIES_ON_QUOTA_ERROR; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === MAX_RETRIES_ON_QUOTA_ERROR || !isQuotaError(error)) throw error
      await sleep(2000 * (attempt + 1))
      lastRequestAt = Date.now()
    }
  }
  throw new Error('No se pudo completar la solicitud a Google Tag Manager.')
}

// Escanear todos los contenedores de todas las cuentas cuesta una solicitud
// por cuenta (hay más de 140) y no entra en la cuota de la API. Por eso la
// lista de cuentas se pide una sola vez (1-2 solicitudes) y los contenedores
// se cargan solo para las cuentas que coinciden con lo que se busca. Ambas
// cachés son compartidas por el selector de contenedores, el auto-sync y el
// reporte de Conexa.
type TagManagerAccount = { accountId: string; name: string; path: string }
let cachedAccountList: { expiresAt: number; accounts: TagManagerAccount[] } | null = null
let pendingAccountList: Promise<TagManagerAccount[]> | null = null
const cachedContainersByAccount = new Map<string, { expiresAt: number; containers: TagManagerAccountSummary[] }>()
const pendingContainersByAccount = new Map<string, Promise<TagManagerAccountSummary[]>>()
let blockedUntil = 0

const ACCOUNTS_CACHE_TTL = 30 * 60_000
const CONTAINERS_CACHE_TTL = 30 * 60_000
const MAX_ACCOUNT_PAGES = 10
const MAX_MATCHED_ACCOUNTS_PER_SEARCH = 8
const MAX_ACCOUNTS_SCANNED_TO_RESOLVE_CONTAINER = 12

const QUOTA_MESSAGE = 'Google Tag Manager alcanzó el límite de consultas. Intentá nuevamente en un minuto.'

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

async function guardQuota<T>(fn: () => Promise<T>): Promise<T> {
  if (Date.now() < blockedUntil) throw new Error(QUOTA_MESSAGE)
  try {
    return await fn()
  } catch (error) {
    if (isQuotaError(error)) {
      blockedUntil = Date.now() + 60_000
      throw new Error(QUOTA_MESSAGE)
    }
    throw error
  }
}

async function getAccountList(): Promise<TagManagerAccount[]> {
  if (cachedAccountList && cachedAccountList.expiresAt > Date.now()) return cachedAccountList.accounts
  if (pendingAccountList) return pendingAccountList
  const tagmanager = getTagManagerClient()
  pendingAccountList = guardQuota(async () => {
    const accounts: TagManagerAccount[] = []
    let pageToken: string | undefined
    for (let page = 0; page < MAX_ACCOUNT_PAGES; page++) {
      const response = await throttledTagManagerRequest(() => tagmanager.accounts.list({ pageToken }))
      for (const account of response.data.account ?? []) {
        if (account.accountId && account.path) accounts.push({ accountId: account.accountId, name: account.name ?? '', path: account.path })
      }
      pageToken = response.data.nextPageToken ?? undefined
      if (!pageToken) break
    }
    cachedAccountList = { accounts, expiresAt: Date.now() + ACCOUNTS_CACHE_TTL }
    return accounts
  })
  try {
    return await pendingAccountList
  } finally {
    pendingAccountList = null
  }
}

async function getAccountContainers(account: TagManagerAccount): Promise<TagManagerAccountSummary[]> {
  const cached = cachedContainersByAccount.get(account.accountId)
  if (cached && cached.expiresAt > Date.now()) return cached.containers
  const pending = pendingContainersByAccount.get(account.accountId)
  if (pending) return pending
  const tagmanager = getTagManagerClient()
  const request = guardQuota(async () => {
    const containers: TagManagerAccountSummary[] = []
    let pageToken: string | undefined
    do {
      const response = await throttledTagManagerRequest(() => tagmanager.accounts.containers.list({ parent: account.path, pageToken }))
      for (const container of response.data.container ?? []) {
        containers.push({ accountId: account.accountId, accountName: account.name, containerId: container.containerId ?? '', containerName: container.name ?? '', publicId: container.publicId ?? '' })
      }
      pageToken = response.data.nextPageToken ?? undefined
    } while (pageToken)
    cachedContainersByAccount.set(account.accountId, { containers, expiresAt: Date.now() + CONTAINERS_CACHE_TTL })
    return containers
  })
  pendingContainersByAccount.set(account.accountId, request)
  try {
    return await request
  } finally {
    pendingContainersByAccount.delete(account.accountId)
  }
}

function cachedContainers() {
  const now = Date.now()
  return [...cachedContainersByAccount.values()].filter((entry) => entry.expiresAt > now).flatMap((entry) => entry.containers)
}

async function lookupContainerByPublicId(publicId: string): Promise<TagManagerAccountSummary | null> {
  const known = cachedContainers().find((container) => container.publicId.toUpperCase() === publicId)
  if (known) return known
  const tagmanager = getTagManagerClient()
  const response = await guardQuota(() => throttledTagManagerRequest(() => tagmanager.accounts.containers.lookup({ tagId: publicId }))).catch((error) => {
    if (error instanceof Error && error.message === QUOTA_MESSAGE) throw error
    return null
  })
  const container = response?.data
  if (!container?.accountId || !container.containerId) return null
  const accounts = await getAccountList()
  const account = accounts.find((item) => item.accountId === container.accountId)
  return { accountId: container.accountId, accountName: account?.name ?? '', containerId: container.containerId, containerName: container.name ?? '', publicId: container.publicId ?? publicId }
}

export type TagManagerContainersResult =
  | { ok: true; containers: TagManagerAccountSummary[]; matchedAccounts: number; truncated: boolean }
  | { ok: false; error: string; retryAfterSeconds: number }

function toFailure(error: unknown): TagManagerContainersResult {
  const message = error instanceof Error ? error.message : 'No se pudieron cargar contenedores de Tag Manager'
  return { ok: false, error: message, retryAfterSeconds: message === QUOTA_MESSAGE ? Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000)) : 60 }
}

/** Contenedores de las cuentas de GTM cuyo nombre cumple `matchAccount`. Solo consulta los contenedores de esas cuentas. */
export async function findTagManagerContainers(matchAccount: (accountName: string) => boolean, maxAccounts = MAX_MATCHED_ACCOUNTS_PER_SEARCH): Promise<TagManagerContainersResult> {
  try {
    const matched = (await getAccountList()).filter((account) => matchAccount(account.name))
    const containers: TagManagerAccountSummary[] = []
    for (const account of matched.slice(0, maxAccounts)) containers.push(...(await getAccountContainers(account)))
    return { ok: true, containers, matchedAccounts: matched.length, truncated: matched.length > maxAccounts }
  } catch (error) {
    return toFailure(error)
  }
}

/**
 * Busca contenedores por nombre de cuenta, por nombre de contenedor ya conocido
 * o por ID público (GTM-XXXX). Sin texto devuelve los contenedores ya cargados.
 */
export async function searchTagManagerContainers(query: string): Promise<TagManagerContainersResult> {
  const trimmed = query.trim()
  if (/^GTM-[A-Z0-9]+$/i.test(trimmed)) {
    try {
      const container = await lookupContainerByPublicId(trimmed.toUpperCase())
      return { ok: true, containers: container ? [container] : [], matchedAccounts: container ? 1 : 0, truncated: false }
    } catch (error) {
      return toFailure(error)
    }
  }
  const terms = normalizeText(trimmed).split(' ').filter(Boolean)
  if (!terms.length) return { ok: true, containers: cachedContainers(), matchedAccounts: 0, truncated: false }
  const matches = (text: string) => { const normalized = normalizeText(text); return terms.every((term) => normalized.includes(term)) }
  const result = await findTagManagerContainers(matches)
  if (!result.ok) return result
  const byId = new Map(result.containers.map((container) => [container.containerId, container]))
  for (const container of cachedContainers()) {
    if (!byId.has(container.containerId) && matches(`${container.containerName} ${container.publicId}`)) byId.set(container.containerId, container)
  }
  return { ...result, containers: [...byId.values()] }
}

async function resolveContainer(containerId: string, clientName?: string | null): Promise<TagManagerAccountSummary | null> {
  const known = cachedContainers().find((container) => container.containerId === containerId)
  if (known) return known
  const accounts = await getAccountList()
  const hint = normalizeText(clientName ?? '').split(' ').filter((term) => term.length >= 3)
  const score = (account: TagManagerAccount) => { const name = normalizeText(account.name); return hint.filter((term) => name.includes(term)).length }
  const candidates = hint.length ? [...accounts].sort((a, b) => score(b) - score(a)) : accounts
  for (const account of candidates.slice(0, MAX_ACCOUNTS_SCANNED_TO_RESOLVE_CONTAINER)) {
    const found = (await getAccountContainers(account)).find((container) => container.containerId === containerId)
    if (found) return found
  }
  return null
}

// Reporte por contenedor cacheado brevemente: si el dashboard vuelve a pedir
// el mismo contenedor (cambio de rango de fechas, recarga de pestaña, etc.)
// dentro de esta ventana, se reutiliza en vez de golpear la API de nuevo.
const CONTAINER_REPORT_CACHE_TTL = 3 * 60_000
const cachedContainerReports = new Map<string, { expiresAt: number; report: TagManagerContainerReport }>()

// Traducciones de los códigos internos de la Tag Manager API a las
// etiquetas legibles que muestra la interfaz de GTM. La API no expone un
// endpoint de "nombre legible por tipo", así que estos mapas cubren los
// tipos más comunes; cualquier tipo no mapeado se muestra tal cual lo
// devuelve la API en lugar de inventar una traducción.
const TAG_TYPE_LABELS: Record<string, string> = {
  gaawe: 'Google Analytics: evento de GA4',
  googtag: 'Etiqueta de Google',
  gaawc: 'Etiqueta de Google',
  awct: 'Seguimiento de conversiones de Google Ads',
  sp: 'Remarketing de Google Ads',
  html: 'HTML personalizado',
  img: 'Imagen personalizada',
  flc: 'Floodlight: contador estándar',
  fls: 'Floodlight: seguimiento de ventas',
  ua: 'Universal Analytics',
  gclidw: 'Conversion Linker',
  cvt: 'Plantilla personalizada',
}
const TRIGGER_TYPE_LABELS: Record<string, string> = {
  pageview: 'Vista de página',
  domReady: 'DOM listo',
  windowLoaded: 'Ventana cargada',
  init: 'Inicialización',
  click: 'Todos los elementos',
  linkClick: 'Solo enlaces',
  historyChange: 'Cambio en el historial',
  elementVisibility: 'Visibilidad del elemento',
  formSubmission: 'Envío de formulario',
  customEvent: 'Evento personalizado',
  jsError: 'Error de JavaScript',
  timer: 'Temporizador',
  youTube: 'Video de YouTube',
  scrollDepth: 'Profundidad de desplazamiento',
}
const VARIABLE_TYPE_LABELS: Record<string, string> = {
  c: 'Constante',
  d: 'Elemento DOM',
  j: 'Variable de JavaScript',
  jsm: 'JavaScript personalizado',
  v: 'Variable de capa de datos',
  u: 'Configuración de Google Analytics',
  awec: 'Datos proporcionados por los usuarios',
  k: 'Cookie de primera parte',
  f: 'HTTP Referrer',
  smm: 'Tabla de búsqueda',
}
const FILTER_OPERATOR_LABELS: Record<string, string> = {
  contains: 'contiene',
  equals: 'es igual a',
  startsWith: 'empieza con',
  endsWith: 'termina con',
  matchRegex: 'coincide con regex',
  greater: 'es mayor que',
  greaterOrEquals: 'es mayor o igual que',
  less: 'es menor que',
  lessOrEquals: 'es menor o igual que',
  cssSelector: 'selector CSS',
}

const stripTemplate = (value?: string | null) => (value ?? '').replace(/^\{\{/, '').replace(/\}\}$/, '')
const asEpochMs = (fingerprint?: string | null) => { const parsed = Number(fingerprint); return Number.isFinite(parsed) && parsed > 0 ? parsed : null }
const asISO = (fingerprint?: string | null) => { const ms = asEpochMs(fingerprint); return ms ? new Date(ms).toISOString() : null }

type GtmParameter = { type?: string | null; key?: string | null; value?: string | null; list?: GtmParameter[] | null; map?: GtmParameter[] | null }
type GtmFilter = { type?: string | null; parameter?: GtmParameter[] | null }

export type TagManagerParameterRow = { key: string; value: string }
export type TagManagerFilterRow = { field: string | null; operator: string; value: string }

function summarizeFilterCondition(entry: GtmFilter): TagManagerFilterRow {
  const field = stripTemplate(entry.parameter?.find((param) => param.key === 'arg0')?.value)
  const value = entry.parameter?.find((param) => param.key === 'arg1')?.value ?? ''
  const operator = FILTER_OPERATOR_LABELS[entry.type ?? ''] ?? entry.type ?? ''
  return { field: field || null, operator, value }
}

function summarizeFilter(filter?: GtmFilter[] | null) {
  const first = filter?.[0]
  return first ? summarizeFilterCondition(first) : null
}

// Los parámetros de la API pueden anidarse (una etiqueta de GA4 trae sus
// "Parámetros del evento" como un `map` de pares clave/valor, por ejemplo).
// Esta función los aplana en texto legible sin inventar ninguna etiqueta:
// lo que no tiene traducción se muestra literal.
function formatParameterValue(param: GtmParameter): string {
  if (param.type === 'list') return (param.list ?? []).map((item) => formatParameterValue(item)).join(', ')
  if (param.type === 'map') return (param.map ?? []).map((item) => `${item.key ?? ''}: ${formatParameterValue(item)}`).join(' · ')
  if (param.type === 'boolean') return param.value === 'true' ? 'Sí' : 'No'
  return param.value ?? ''
}

function formatParameters(parameters?: GtmParameter[] | null): TagManagerParameterRow[] {
  return (parameters ?? []).filter((param) => param.key).map((param) => ({ key: param.key ?? '', value: formatParameterValue(param) }))
}

export type TagManagerTagRow = { tagId: string; name: string; type: string; typeLabel: string; paused: boolean; firingTriggerNames: string[]; blockingTriggerNames: string[]; parameters: TagManagerParameterRow[]; notes: string | null; lastModifiedAt: string | null }
export type TagManagerTriggerRow = { triggerId: string; name: string; type: string; typeLabel: string; filter: TagManagerFilterRow | null; conditions: TagManagerFilterRow[]; additionalConditions: TagManagerFilterRow[]; tagCount: number; firingTagNames: string[]; notes: string | null; lastModifiedAt: string | null }
export type TagManagerVariableRow = { variableId: string; name: string; type: string; typeLabel: string; parameters: TagManagerParameterRow[]; notes: string | null; lastModifiedAt: string | null }
export type TagManagerContainerReport = {
  containerId: string
  accountId: string
  containerName: string
  publicId: string
  tags: TagManagerTagRow[]
  triggers: TagManagerTriggerRow[]
  variables: TagManagerVariableRow[]
  diagnostics: { totalTags: number; activeTags: number; pausedTags: number; totalTriggers: number; totalVariables: number; tagsWithoutTrigger: number; triggersWithoutTags: number }
}
export type TagManagerReport = { containers: TagManagerContainerReport[]; errors: Array<{ containerId: string; message: string }> }

export async function getGoogleTagManagerReport(containerIdsCsv?: string | null, options: { clientName?: string | null } = {}): Promise<TagManagerReport> {
  const requestedIds = [...new Set((containerIdsCsv ?? '').split(',').map((id) => id.trim()).filter(Boolean))]
  if (!requestedIds.length) return { containers: [], errors: [] }

  const tagmanager = getTagManagerClient()
  const errors: Array<{ containerId: string; message: string }> = []
  // Se procesa un contenedor a la vez (no Promise.all) para que, si un
  // cliente tiene varios contenedores, no se disparen todas sus llamadas
  // en simultáneo: el throttle interno ya serializa las solicitudes a
  // Google, pero recorrerlas en orden evita encolar de golpe decenas de
  // llamadas cuando alcanza con reutilizar la caché por contenedor.
  const containers: Array<TagManagerContainerReport | null> = []
  for (const containerId of requestedIds) {
    const cached = cachedContainerReports.get(containerId)
    if (cached && cached.expiresAt > Date.now()) { containers.push(cached.report); continue }
    try {
      const summary = await resolveContainer(containerId, options.clientName)
      if (!summary) { errors.push({ containerId, message: 'No se encontró este contenedor en las cuentas de Google Tag Manager conectadas.' }); containers.push(null); continue }
      const containerPath = `accounts/${summary.accountId}/containers/${containerId}`
      const workspaces = await throttledTagManagerRequest(() => tagmanager.accounts.containers.workspaces.list({ parent: containerPath }))
      const workspace = workspaces.data.workspace?.find((item) => item.name === 'Default Workspace') ?? workspaces.data.workspace?.[0]
      if (!workspace?.path) { errors.push({ containerId, message: 'El contenedor no tiene un espacio de trabajo disponible.' }); containers.push(null); continue }

      const [tagsResponse, triggersResponse, variablesResponse] = await Promise.all([
        throttledTagManagerRequest(() => tagmanager.accounts.containers.workspaces.tags.list({ parent: workspace.path! })),
        throttledTagManagerRequest(() => tagmanager.accounts.containers.workspaces.triggers.list({ parent: workspace.path! })),
        throttledTagManagerRequest(() => tagmanager.accounts.containers.workspaces.variables.list({ parent: workspace.path! })),
      ])

      const triggerNameById = new Map((triggersResponse.data.trigger ?? []).map((trigger) => [trigger.triggerId ?? '', trigger.name ?? '']))
      const tagCountByTriggerId = new Map<string, number>()
      const tagNamesByTriggerId = new Map<string, string[]>()
      for (const tag of tagsResponse.data.tag ?? []) {
        for (const triggerId of tag.firingTriggerId ?? []) {
          tagCountByTriggerId.set(triggerId, (tagCountByTriggerId.get(triggerId) ?? 0) + 1)
          tagNamesByTriggerId.set(triggerId, [...(tagNamesByTriggerId.get(triggerId) ?? []), tag.name ?? ''])
        }
      }

      const tags: TagManagerTagRow[] = (tagsResponse.data.tag ?? []).map((tag) => ({
        tagId: tag.tagId ?? '',
        name: tag.name ?? '',
        type: tag.type ?? '',
        typeLabel: TAG_TYPE_LABELS[tag.type ?? ''] ?? tag.type ?? 'Desconocido',
        paused: Boolean(tag.paused),
        firingTriggerNames: (tag.firingTriggerId ?? []).map((triggerId) => triggerNameById.get(triggerId) ?? triggerId),
        blockingTriggerNames: (tag.blockingTriggerId ?? []).map((triggerId) => triggerNameById.get(triggerId) ?? triggerId),
        parameters: formatParameters(tag.parameter),
        notes: tag.notes ?? null,
        lastModifiedAt: asISO(tag.fingerprint),
      }))
      const triggers: TagManagerTriggerRow[] = (triggersResponse.data.trigger ?? []).map((trigger) => ({
        triggerId: trigger.triggerId ?? '',
        name: trigger.name ?? '',
        type: trigger.type ?? '',
        typeLabel: TRIGGER_TYPE_LABELS[trigger.type ?? ''] ?? trigger.type ?? 'Desconocido',
        filter: summarizeFilter(trigger.filter),
        conditions: (trigger.filter ?? []).map(summarizeFilterCondition),
        additionalConditions: (trigger.autoEventFilter ?? []).map(summarizeFilterCondition),
        tagCount: tagCountByTriggerId.get(trigger.triggerId ?? '') ?? 0,
        firingTagNames: tagNamesByTriggerId.get(trigger.triggerId ?? '') ?? [],
        notes: trigger.notes ?? null,
        lastModifiedAt: asISO(trigger.fingerprint),
      }))
      const variables: TagManagerVariableRow[] = (variablesResponse.data.variable ?? []).map((variable) => ({
        variableId: variable.variableId ?? '',
        name: variable.name ?? '',
        type: variable.type ?? '',
        typeLabel: VARIABLE_TYPE_LABELS[variable.type ?? ''] ?? variable.type ?? 'Desconocido',
        parameters: formatParameters(variable.parameter),
        notes: variable.notes ?? null,
        lastModifiedAt: asISO(variable.fingerprint),
      }))

      const activeTags = tags.filter((tag) => !tag.paused).length
      const diagnostics = {
        totalTags: tags.length,
        activeTags,
        pausedTags: tags.length - activeTags,
        totalTriggers: triggers.length,
        totalVariables: variables.length,
        tagsWithoutTrigger: tags.filter((tag) => tag.firingTriggerNames.length === 0).length,
        triggersWithoutTags: triggers.filter((trigger) => trigger.tagCount === 0).length,
      }

      const report: TagManagerContainerReport = { containerId, accountId: summary.accountId, containerName: summary.containerName, publicId: summary.publicId, tags, triggers, variables, diagnostics }
      cachedContainerReports.set(containerId, { expiresAt: Date.now() + CONTAINER_REPORT_CACHE_TTL, report })
      containers.push(report)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo consultar este contenedor de Google Tag Manager.'
      errors.push({ containerId, message: isQuotaError(cause) ? 'Google Tag Manager alcanzó el límite de consultas para este contenedor. Se reintentará en la próxima carga.' : message })
      containers.push(null)
    }
  }

  return { containers: containers.filter((container): container is TagManagerContainerReport => container !== null), errors }
}
