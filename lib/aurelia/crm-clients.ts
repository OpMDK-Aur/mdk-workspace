import { createCrmClient } from '@/lib/supabase/crm'

const PAGE_SIZE = 1000
const MAX_ROWS = 20000

export type AureliaClientOption = { id: string; label: string; email: string | null }

/** Lista liviana de clientes del CRM (id y nombre) para el selector del timer. */
export async function getAureliaClientOptions(): Promise<AureliaClientOption[]> {
  const crm = createCrmClient()
  const options: AureliaClientOption[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await crm.from('clients').select('id,name,email').order('id').range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    for (const row of (data ?? []) as Array<{ id: string; name: string | null; email: string | null }>) {
      options.push({ id: row.id, label: row.name?.trim() || row.email || 'Sin nombre', email: row.email })
    }
    if ((data ?? []).length < PAGE_SIZE) break
  }
  return options.sort((a, b) => a.label.localeCompare(b.label, 'es'))
}
