/** Clients can have several Facebook pages; they are stored comma-separated in `clientes.meta_page_id`. */
export function parsePageIds(value: string | null | undefined): string[] {
  return [...new Set((value ?? '').split(',').map((id) => id.trim()).filter(Boolean))]
}

export function serializePageIds(ids: string[]): string | null {
  const unique = parsePageIds(ids.join(','))
  return unique.length ? unique.join(',') : null
}
