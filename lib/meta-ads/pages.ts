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

export async function listAccessiblePages(): Promise<MetaPage[]> {
  const token = process.env.META_ADS_ACCESS_TOKEN
  if (!token) throw new Error('META_ADS_ACCESS_TOKEN no configurado')
  const pages = await collect<MetaPage>(`${META_BASE_URL}/me/accounts?fields=id,name,category&limit=100&access_token=${token}`)
  return pages.sort((a, b) => a.name.localeCompare(b.name))
}

/** Pages an ad account is allowed to advertise with. Errors per account are ignored. */
export async function listPromotablePages(accountIds: string[]): Promise<MetaPage[]> {
  const token = process.env.META_ADS_ACCESS_TOKEN
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
