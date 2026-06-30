// lib/revops/ghl-client.ts
// Cliente GHL del lado del servidor para el agente RevOps.
// Reutiliza el mismo patrón de paginación/retry que /api/ghl/opportunities y /api/ghl/contacts.

const GHL_BASE = 'https://services.leadconnectorhq.com'
const VERSION_2021_07_28 = '2021-07-28'
const VERSION_2021_04_15 = '2021-04-15'

const MAX_RETRIES = 3
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface GhlCreds {
  locationId: string
  token: string
}

async function fetchWithRetry(url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, options)
    if (res.status === 429) {
      const waitTime = Math.pow(2, attempt) * 1000
      await delay(waitTime)
      continue
    }
    return res
  }
  return fetch(url, options)
}

function authHeaders(token: string, version: string) {
  return {
    Authorization: `Bearer ${token}`,
    Version: version,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

// ── Opportunities ────────────────────────────────────────────────────────

export interface GhlOpportunity {
  id: string
  name: string
  monetaryValue: number | null
  pipelineId: string
  pipelineStageId: string
  status: string // 'open' | 'won' | 'lost' | 'abandoned'
  assignedTo: string | null
  contactId: string | null
  contactName: string
  createdAt: string
  updatedAt: string
}

export async function fetchGhlOpportunities(creds: GhlCreds, maxPages = 50): Promise<GhlOpportunity[]> {
  const url = `${GHL_BASE}/opportunities/search`
  const all: GhlOpportunity[] = []
  let page = 1
  let hasMore = true
  const PAGE_SIZE = 100

  while (hasMore && page <= maxPages) {
    if (page > 1) await delay(250)

    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: authHeaders(creds.token, VERSION_2021_07_28),
      body: JSON.stringify({ locationId: creds.locationId, limit: PAGE_SIZE, page }),
      cache: 'no-store',
    })

    if (!res.ok) {
      if (all.length > 0) break
      throw new Error(`GHL opportunities HTTP ${res.status}`)
    }

    const json = await res.json()
    const pageItems = json.opportunities ?? []

    for (const o of pageItems) {
      all.push({
        id: o.id ?? '',
        name: o.name ?? '',
        monetaryValue: o.monetaryValue ?? null,
        pipelineId: o.pipelineId ?? '',
        pipelineStageId: o.pipelineStageId ?? '',
        status: o.status ?? 'open',
        // NOTA: verificar en Postman el nombre exacto (assignedTo vs assignedUserId)
        assignedTo: o.assignedTo ?? o.assignedUserId ?? null,
        contactId: o.contact?.id ?? null,
        contactName: o.contact?.name ?? '',
        createdAt: o.createdAt ?? '',
        updatedAt: o.updatedAt ?? o.createdAt ?? '',
      })
    }

    if (pageItems.length === 0 || pageItems.length < PAGE_SIZE) hasMore = false
    page++
  }

  return all
}

// ── Pipelines (para mapear nombres de etapa y detectar etapas iniciales) ──

export interface GhlPipelineStage {
  id: string
  name: string
  position: number
}

export interface GhlPipeline {
  id: string
  name: string
  stages: GhlPipelineStage[]
}

export async function fetchGhlPipelines(creds: GhlCreds): Promise<GhlPipeline[]> {
  const url = `${GHL_BASE}/opportunities/pipelines?locationId=${creds.locationId}`
  const res = await fetchWithRetry(url, {
    method: 'GET',
    headers: authHeaders(creds.token, VERSION_2021_07_28),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`GHL pipelines HTTP ${res.status}`)
  const json = await res.json()
  const pipelines = json.pipelines ?? []
  return pipelines.map((p: any) => ({
    id: p.id ?? '',
    name: p.name ?? '',
    stages: (p.stages ?? []).map((s: any, idx: number) => ({
      id: s.id ?? '',
      name: s.name ?? '',
      position: typeof s.position === 'number' ? s.position : idx,
    })),
  }))
}

// ── Tareas por contacto (GHL no tiene "tasks/search" global por location) ─

export interface GhlTask {
  id: string
  title: string
  dueDate: string | null
  completed: boolean
}

export async function fetchGhlContactTasks(creds: GhlCreds, contactId: string): Promise<GhlTask[]> {
  const url = `${GHL_BASE}/contacts/${contactId}/tasks`
  const res = await fetchWithRetry(url, {
    method: 'GET',
    headers: authHeaders(creds.token, VERSION_2021_07_28),
    cache: 'no-store',
  })
  if (!res.ok) return [] // contacto sin tareas o error puntual: no aborta el análisis completo
  const json = await res.json()
  const tasks = json.tasks ?? []
  return tasks.map((t: any) => ({
    id: t.id ?? '',
    title: t.title ?? '',
    dueDate: t.dueDate ?? null,
    completed: !!t.completed,
  }))
}

// ── Conversaciones ───────────────────────────────────────────────────────

export interface GhlConversation {
  id: string
  contactId: string
  contactName: string
  unreadCount: number
  lastMessageDate: string | null
}

export async function fetchGhlConversations(creds: GhlCreds, maxPages = 30): Promise<GhlConversation[]> {
  const all: GhlConversation[] = []
  let cursor: string | null = null
  let page = 0
  const PAGE_SIZE = 100

  while (page < maxPages) {
    if (page > 0) await delay(250)
    const params = new URLSearchParams({
      locationId: creds.locationId,
      limit: String(PAGE_SIZE),
      sort: 'desc',
      sortBy: 'last_message_date',
    })
    if (cursor) params.set('startAfterDate', cursor)

    const res = await fetchWithRetry(`${GHL_BASE}/conversations/search?${params.toString()}`, {
      method: 'GET',
      headers: authHeaders(creds.token, VERSION_2021_04_15),
      cache: 'no-store',
    })
    if (!res.ok) {
      if (all.length > 0) break
      throw new Error(`GHL conversations HTTP ${res.status}`)
    }
    const json = await res.json()
    const items = json.conversations ?? []

    for (const c of items) {
      all.push({
        id: c.id ?? '',
        contactId: c.contactId ?? '',
        contactName: c.contactName ?? c.fullName ?? '',
        unreadCount: c.unreadCount ?? 0,
        lastMessageDate: c.lastMessageDate ?? c.dateUpdated ?? null,
      })
    }

    if (items.length === 0 || items.length < PAGE_SIZE) break
    cursor = items[items.length - 1]?.lastMessageDate ?? null
    if (!cursor) break
    page++
  }

  return all
}

export interface GhlMessage {
  id: string
  direction: 'inbound' | 'outbound'
  body: string
  dateAdded: string
  userId: string | null // presente cuando un humano lo escribió desde el inbox de GHL
}

export async function fetchGhlConversationMessages(creds: GhlCreds, conversationId: string): Promise<GhlMessage[]> {
  const url = `${GHL_BASE}/conversations/${conversationId}/messages?limit=100`
  const res = await fetchWithRetry(url, {
    method: 'GET',
    headers: authHeaders(creds.token, VERSION_2021_04_15),
    cache: 'no-store',
  })
  if (!res.ok) return []
  const json = await res.json()
  // La forma de la respuesta varía entre versiones: a veces viene anidada en messages.messages
  const raw = json.messages?.messages ?? json.messages ?? []
  return raw
    .map((m: any) => ({
      id: m.id ?? '',
      direction: (m.direction ?? 'inbound') as 'inbound' | 'outbound',
      body: m.body ?? '',
      dateAdded: m.dateAdded ?? '',
      userId: m.userId ?? null,
    }))
    .sort((a: GhlMessage, b: GhlMessage) => new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime())
}