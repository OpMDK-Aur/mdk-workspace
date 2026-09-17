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

// Esta caché en memoria de proceso es compartida entre el endpoint de
// selección de contenedores (app/api/google/tag-manager/accounts) y el
// reporte de Conexa para no escanear todas las cuentas dos veces y agotar
// la cuota cuando ambos se usan en la misma ventana de tiempo.
let cachedAccounts: { expiresAt: number; accounts: TagManagerAccountSummary[] } | null = null
let pendingAccountsRequest: Promise<TagManagerAccountSummary[]> | null = null
let blockedUntil = 0
let lastSyncStartedAt = 0

const ACCOUNTS_CACHE_TTL = 10 * 60_000
const MIN_SYNC_INTERVAL = 60_000
const MAX_GOOGLE_REQUESTS_PER_SYNC = 20

// Reporte por contenedor cacheado brevemente: si el dashboard vuelve a pedir
// el mismo contenedor (cambio de rango de fechas, recarga de pestaña, etc.)
// dentro de esta ventana, se reutiliza en vez de golpear la API de nuevo.
const CONTAINER_REPORT_CACHE_TTL = 3 * 60_000
const cachedContainerReports = new Map<string, { expiresAt: number; report: TagManagerContainerReport }>()

type TagManagerAccountsResult = { ok: true; accounts: TagManagerAccountSummary[] } | { ok: false; error: string; retryAfterSeconds: number }

export async function listAllTagManagerAccounts(): Promise<TagManagerAccountsResult> {
  const now = Date.now()
  if (now < blockedUntil) return { ok: false, error: 'Google Tag Manager está temporalmente limitado por cuota. Intentá nuevamente en unos segundos.', retryAfterSeconds: Math.ceil((blockedUntil - now) / 1000) }
  if (cachedAccounts && cachedAccounts.expiresAt > now) return { ok: true, accounts: cachedAccounts.accounts }
  if (pendingAccountsRequest) return { ok: true, accounts: await pendingAccountsRequest }
  if (now - lastSyncStartedAt < MIN_SYNC_INTERVAL) return { ok: false, error: 'La sincronización de Google Tag Manager está en pausa para respetar la cuota. Intentá nuevamente más tarde.', retryAfterSeconds: Math.ceil((MIN_SYNC_INTERVAL - (now - lastSyncStartedAt)) / 1000) }
  lastSyncStartedAt = now
  const tagmanager = getTagManagerClient()
  pendingAccountsRequest = (async () => {
    const result: TagManagerAccountSummary[] = []
    let accountPageToken: string | undefined
    let googleRequestCount = 0
    do {
      googleRequestCount += 1
      if (googleRequestCount > MAX_GOOGLE_REQUESTS_PER_SYNC) break
      const accounts = await throttledTagManagerRequest(() => tagmanager.accounts.list({ pageToken: accountPageToken }))
      for (const account of accounts.data.account ?? []) {
        let containerPageToken: string | undefined
        do {
          googleRequestCount += 1
          if (googleRequestCount > MAX_GOOGLE_REQUESTS_PER_SYNC) break
          const containers = await throttledTagManagerRequest(() => tagmanager.accounts.containers.list({ parent: account.path ?? '', pageToken: containerPageToken }))
          for (const container of containers.data.container ?? []) {
            result.push({ accountId: account.accountId ?? '', accountName: account.name ?? '', containerId: container.containerId ?? '', containerName: container.name ?? '', publicId: container.publicId ?? '' })
          }
          containerPageToken = containers.data.nextPageToken ?? undefined
        } while (containerPageToken)
      }
      accountPageToken = accounts.data.nextPageToken ?? undefined
    } while (accountPageToken)
    return result
  })()
  try {
    const accounts = await pendingAccountsRequest
    cachedAccounts = { accounts, expiresAt: Date.now() + ACCOUNTS_CACHE_TTL }
    return { ok: true, accounts }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudieron cargar contenedores de Tag Manager'
    if (/quota|rate limit|too many requests|429/i.test(message)) {
      blockedUntil = Date.now() + 60_000
      return { ok: false, error: 'Google Tag Manager alcanzó el límite de consultas. La carga se reanudará automáticamente en un minuto.', retryAfterSeconds: 60 }
    }
    return { ok: false, error: message, retryAfterSeconds: 60 }
  } finally {
    pendingAccountsRequest = null
  }
}

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

type GtmParameter = { type?: string | null; key?: string | null; value?: string | null }

function summarizeFilter(filter?: Array<{ type?: string | null; parameter?: GtmParameter[] | null }> | null) {
  const first = filter?.[0]
  if (!first) return null
  const field = stripTemplate(first.parameter?.find((param) => param.key === 'arg0')?.value)
  const value = first.parameter?.find((param) => param.key === 'arg1')?.value ?? ''
  const operator = FILTER_OPERATOR_LABELS[first.type ?? ''] ?? first.type ?? ''
  return { field: field || null, operator, value }
}

export type TagManagerTagRow = { tagId: string; name: string; type: string; typeLabel: string; paused: boolean; firingTriggerNames: string[]; lastModifiedAt: string | null }
export type TagManagerTriggerRow = { triggerId: string; name: string; type: string; typeLabel: string; filter: { field: string | null; operator: string; value: string } | null; tagCount: number; lastModifiedAt: string | null }
export type TagManagerVariableRow = { variableId: string; name: string; type: string; typeLabel: string; lastModifiedAt: string | null }
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

export async function getGoogleTagManagerReport(containerIdsCsv?: string | null): Promise<TagManagerReport> {
  const requestedIds = [...new Set((containerIdsCsv ?? '').split(',').map((id) => id.trim()).filter(Boolean))]
  if (!requestedIds.length) return { containers: [], errors: [] }

  const accountsResult = await listAllTagManagerAccounts()
  if (!accountsResult.ok) return { containers: [], errors: requestedIds.map((containerId) => ({ containerId, message: accountsResult.error })) }
  const accountsByContainerId = new Map(accountsResult.accounts.map((account) => [account.containerId, account]))

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
    const summary = accountsByContainerId.get(containerId)
    if (!summary) { errors.push({ containerId, message: 'No se encontró este contenedor en las cuentas de Google Tag Manager conectadas.' }); containers.push(null); continue }
    try {
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
      for (const tag of tagsResponse.data.tag ?? []) {
        for (const triggerId of tag.firingTriggerId ?? []) tagCountByTriggerId.set(triggerId, (tagCountByTriggerId.get(triggerId) ?? 0) + 1)
      }

      const tags: TagManagerTagRow[] = (tagsResponse.data.tag ?? []).map((tag) => ({
        tagId: tag.tagId ?? '',
        name: tag.name ?? '',
        type: tag.type ?? '',
        typeLabel: TAG_TYPE_LABELS[tag.type ?? ''] ?? tag.type ?? 'Desconocido',
        paused: Boolean(tag.paused),
        firingTriggerNames: (tag.firingTriggerId ?? []).map((triggerId) => triggerNameById.get(triggerId) ?? triggerId),
        lastModifiedAt: asISO(tag.fingerprint),
      }))
      const triggers: TagManagerTriggerRow[] = (triggersResponse.data.trigger ?? []).map((trigger) => ({
        triggerId: trigger.triggerId ?? '',
        name: trigger.name ?? '',
        type: trigger.type ?? '',
        typeLabel: TRIGGER_TYPE_LABELS[trigger.type ?? ''] ?? trigger.type ?? 'Desconocido',
        filter: summarizeFilter(trigger.filter),
        tagCount: tagCountByTriggerId.get(trigger.triggerId ?? '') ?? 0,
        lastModifiedAt: asISO(trigger.fingerprint),
      }))
      const variables: TagManagerVariableRow[] = (variablesResponse.data.variable ?? []).map((variable) => ({
        variableId: variable.variableId ?? '',
        name: variable.name ?? '',
        type: variable.type ?? '',
        typeLabel: VARIABLE_TYPE_LABELS[variable.type ?? ''] ?? variable.type ?? 'Desconocido',
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
