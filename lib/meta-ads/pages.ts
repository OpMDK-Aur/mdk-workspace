import { getMetaAccessToken } from './token'

const META_API_VERSION = process.env.META_API_VERSION || 'v25.0'
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`
const MAX_PAGES_OF_RESULTS = 10

export interface MetaPage {
  id: string
  name: string
  category?: string
}

type GraphList<T> = { data?: T[]; paging?: { next?: string }; error?: { message: string } }

async function collect<T>(firstUrl: string): Promise<T[]> {
  const items: T[] = []
  let url: string | undefined = firstUrl
  for (let i = 0; url && i < MAX_PAGES_OF_RESULTS; i++) {
    const res = await fetch(url, { cache: 'no-store' })
    const json = (await res.json()) as GraphList<T>
    if (json.error) throw new Error(json.error.message)
    items.push(...(json.data ?? []))
    url = json.paging?.next
  }
  return items
}

type NestedEdge = GraphList<MetaPage>
type BusinessWithPages = { id: string; owned_pages?: NestedEdge; client_pages?: NestedEdge }

const PAGE_FIELDS = 'id,name,category'
const PAGES_CACHE_TTL_MS = 15 * 60 * 1000

let pagesCache: { token: string; pages: MetaPage[]; expiresAt: number } | null = null
let pagesInFlight: Promise<MetaPage[]> | null = null

async function nestedPages(edge: NestedEdge | undefined): Promise<MetaPage[]> {
  if (!edge) return []
  const pages = [...(edge.data ?? [])]
  if (edge.paging?.next) pages.push(...(await collect<MetaPage>(edge.paging.next).catch(() => [])))
  return pages
}

async function fetchAccessiblePages(token: string): Promise<MetaPage[]> {
  // Field expansion pulls every business's owned and client pages in one request instead of two per business,
  // which keeps the app under Meta's application request limit (#4).
  const businessFields = `id,owned_pages.limit(100){${PAGE_FIELDS}},client_pages.limit(100){${PAGE_FIELDS}}`
  const [directPages, businesses] = await Promise.all([
    collect<MetaPage>(`${META_BASE_URL}/me/accounts?fields=${PAGE_FIELDS}&limit=100&access_token=${token}`),
    collect<BusinessWithPages>(
      `${META_BASE_URL}/me/businesses?fields=${encodeURIComponent(businessFields)}&limit=25&access_token=${token}`,
    ).catch(() => []),
  ])

  const businessPages = await Promise.all(
    businesses.flatMap((business) => [nestedPages(business.owned_pages), nestedPages(business.client_pages)]),
  )

  const unique = new Map<string, MetaPage>()
  for (const page of [...directPages, ...businessPages.flat()]) {
    if (!unique.has(page.id)) unique.set(page.id, page)
  }
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Pages reachable by the Meta token, cached per server instance; a stale list is served if Meta rate-limits a refresh. */
export async function listAccessiblePages(options: { fresh?: boolean } = {}): Promise<MetaPage[]> {
  const token = await getMetaAccessToken()
  if (!token) throw new Error('META_ADS_ACCESS_TOKEN no configurado')
  if (pagesCache && pagesCache.token !== token) pagesCache = null

  if (!options.fresh && pagesCache && pagesCache.expiresAt > Date.now()) return pagesCache.pages
  if (pagesInFlight) return pagesInFlight

  pagesInFlight = fetchAccessiblePages(token)
    .then((pages) => {
      pagesCache = { token, pages, expiresAt: Date.now() + PAGES_CACHE_TTL_MS }
      return pages
    })
    .catch((error) => {
      if (pagesCache) return pagesCache.pages
      throw error
    })
    .finally(() => {
      pagesInFlight = null
    })
  return pagesInFlight
}

/** Names for specific page IDs in a single request. Unknown or inaccessible IDs are omitted. */
export async function getPageNames(pageIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  if (pageIds.length === 0) return names

  const cached = pagesCache?.pages ?? []
  for (const page of cached) if (pageIds.includes(page.id)) names.set(page.id, page.name)
  const missing = pageIds.filter((id) => !names.has(id))
  if (missing.length === 0) return names

  const token = await getMetaAccessToken()
  if (!token) return names
  try {
    const res = await fetch(
      `${META_BASE_URL}/?ids=${missing.map(encodeURIComponent).join(',')}&fields=id,name&access_token=${token}`,
      { cache: 'no-store' },
    )
    const json = (await res.json()) as Record<string, unknown>
    if (!json.error) {
      for (const [id, page] of Object.entries(json)) {
        const name = (page as { name?: unknown } | null)?.name
        if (typeof name === 'string') names.set(id, name)
      }
    }
  } catch {
    // Names are cosmetic; callers fall back to the ID.
  }
  return names
}

/** Pages an ad account is allowed to advertise with. Errors per account are ignored. */
export async function listPromotablePages(accountIds: string[]): Promise<MetaPage[]> {
  const token = await getMetaAccessToken()
  if (!token || accountIds.length === 0) return []
  const results = await Promise.all(
    accountIds.map((id) =>
      collect<MetaPage>(`${META_BASE_URL}/act_${id.replace(/^act_/, '')}/promote_pages?fields=id,name&limit=100&access_token=${token}`).catch(() => []),
    ),
  )
  const unique = new Map<string, MetaPage>()
  for (const page of results.flat()) unique.set(page.id, page)
  return [...unique.values()]
}

function normalizeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function nameScore(clientName: string, pageName: string) {
  const words = normalizeName(clientName).split(' ').filter(Boolean)
  if (words.length === 0) return 0
  const page = normalizeName(pageName)
  return words.filter((w) => page.includes(w)).length / words.length
}

/** Returns the single page that clearly matches the client name, or null when none or several match. */
export function matchPageByName(clientName: string, pages: MetaPage[]): MetaPage | null {
  const candidates = pages.filter((p) => nameScore(clientName, p.name) >= 0.8)
  return candidates.length === 1 ? candidates[0] : null
}
