import 'server-only'
import { z } from 'zod'
import type { SheetGrid } from '@/lib/bulk/types'
import { askJson } from './ai'
import { findInterpretations, saveInterpretation } from './persistence'
import { headersHash, normalizeText } from './text'
import { CANONICAL_ACTIONS, ROLES, sheetInterpretationSchema, type Inventory, type SheetInterpretation } from './types'

const SYSTEM = `Sos un analista de pauta en Meta Ads. Interpretás sheets de pedidos de campañas que cada cliente arma distinto.
Asigná a cada columna un rol semántico: ${ROLES.join(', ')}.
- campaign_name es el nombre completo de la campaña tal como debe existir en Meta (suele seguir una nomenclatura con guiones o barras). Una columna con valores cortos tipo "WHATSAPP" o una marca es attribute, no campaign_name.
- account es la cuenta publicitaria o concesionaria; attribute es contexto (marca, modelo, modalidad, producto).
- instructions son observaciones o notas libres; status es el estado del pedido; action es el tipo de pedido.
- Usá confidence entre 0 y 1. Usá ignore para lo que no aporta.
- actionVocabulary: cada valor distinto de la columna action mapeado a create | replace | add_formats | skip | unknown.
- statusVocabulary.pending: valores que indican que el pedido todavía no se hizo; done y error: el valor a escribir al terminar si existe en el vocabulario del sheet.
Devolvé solo JSON.`

function sample(grid: SheetGrid) {
  return grid.rows.slice(0, 15).map((row) => Object.fromEntries(grid.headers.map((header, index) => [header, row.cells[index]?.slice(0, 120) ?? ''])))
}

function distinctValues(grid: SheetGrid, header: string) {
  const index = grid.headers.indexOf(header)
  return [...new Set(grid.rows.map((row) => row.cells[index]?.trim()).filter(Boolean))].slice(0, 30)
}

function inventorySummary(inventory: Inventory) {
  return inventory.accounts.map((account) => ({
    id: account.id,
    name: account.name,
    campaigns: inventory.campaigns.filter((campaign) => campaign.accountId === account.id).slice(0, 40).map((campaign) => `${campaign.name} [${campaign.objective} · ${campaign.status}]`),
  }))
}

// Completa columnas faltantes y descarta encabezados inventados: la estructura del sheet manda.
function normalizeInterpretation(grid: SheetGrid, interpretation: SheetInterpretation): SheetInterpretation {
  const byHeader = new Map(interpretation.columns.map((column) => [column.header, column]))
  return {
    ...interpretation,
    columns: grid.headers.map((header) => byHeader.get(header) ?? { header, role: 'ignore', confidence: 0, note: 'Sin interpretar' }),
    suggestedRowFilter: interpretation.suggestedRowFilter && grid.headers.includes(interpretation.suggestedRowFilter.column) ? interpretation.suggestedRowFilter : undefined,
  }
}

export async function interpretWithAi(grid: SheetGrid, headers: string[], clientContext: string, inventory: Inventory, known?: SheetInterpretation) {
  const actionLike = grid.headers.filter((header) => /accion|pedido|estado|status|tipo/.test(normalizeText(header)))
  const prompt = JSON.stringify({
    interpretar: headers,
    columnasYaInterpretadas: known?.columns.filter((column) => !headers.includes(column.header)),
    encabezados: grid.headers,
    filasDeMuestra: sample(grid),
    valoresDistintos: Object.fromEntries(actionLike.map((header) => [header, distinctValues(grid, header)])),
    contextoDelCliente: clientContext,
    cuentasPublicitarias: inventorySummary(inventory),
  })
  const raw = await askJson(aiInterpretationSchema, SYSTEM, prompt, 'la interpretación del sheet')
  return fromAiInterpretation(raw)
}

// El modo estricto de structured outputs no admite campos opcionales ni records: la IA responde esta forma y se convierte.
const aiInterpretationSchema = z.object({
  columns: z.array(z.object({ header: z.string(), role: z.enum(ROLES), confidence: z.number(), note: z.string().nullable() })),
  actionVocabulary: z.array(z.object({ value: z.string(), action: z.enum(CANONICAL_ACTIONS) })),
  statusVocabulary: z.object({ pending: z.array(z.string()), done: z.string().nullable(), error: z.string().nullable() }),
  suggestedRowFilter: z.object({ column: z.string(), values: z.array(z.string()) }).nullable(),
  warnings: z.array(z.string()),
})

function fromAiInterpretation(raw: z.infer<typeof aiInterpretationSchema>): SheetInterpretation {
  return sheetInterpretationSchema.parse({
    columns: raw.columns.map(({ note, confidence, ...column }) => ({ ...column, confidence: Math.min(1, Math.max(0, confidence)), ...(note ? { note } : {}) })),
    actionVocabulary: Object.fromEntries(raw.actionVocabulary.filter((entry) => entry.value.trim()).map((entry) => [entry.value.trim(), entry.action])),
    statusVocabulary: { pending: raw.statusVocabulary.pending, ...(raw.statusVocabulary.done ? { done: raw.statusVocabulary.done } : {}), ...(raw.statusVocabulary.error ? { error: raw.statusVocabulary.error } : {}) },
    ...(raw.suggestedRowFilter ? { suggestedRowFilter: raw.suggestedRowFilter } : {}),
    warnings: raw.warnings,
  })
}

export async function interpretSheet({ clientId, grid, clientContext, inventory, userId }: { clientId: string; grid: SheetGrid; clientContext: string; inventory: Inventory; userId: string }) {
  const hash = headersHash(grid.headers)
  const saved = await findInterpretations(clientId)
  const exact = saved.find((item) => item.headersHash === hash)
  if (exact) return { interpretationId: exact.id, headersHash: hash, interpretation: normalizeInterpretation(grid, exact.interpretation), reused: 'full' as const }

  const keys = new Set(grid.headers.map(normalizeText))
  const closest = [...saved].sort((a, b) => b.headers.filter((header) => keys.has(normalizeText(header))).length - a.headers.filter((header) => keys.has(normalizeText(header))).length)[0]
  const kept = closest ? closest.interpretation.columns.filter((column) => grid.headers.includes(column.header)) : []

  let interpretation: SheetInterpretation
  let reused: 'partial' | 'none' = 'none'
  if (closest && kept.length >= Math.ceil(grid.headers.length / 2)) {
    const pendingHeaders = grid.headers.filter((header) => !kept.some((column) => column.header === header))
    const fresh = pendingHeaders.length ? await interpretWithAi(grid, pendingHeaders, clientContext, inventory, closest.interpretation) : null
    interpretation = {
      columns: [...kept, ...(fresh?.columns.filter((column) => pendingHeaders.includes(column.header)) ?? [])],
      actionVocabulary: { ...closest.interpretation.actionVocabulary, ...(fresh?.actionVocabulary ?? {}) },
      statusVocabulary: fresh?.statusVocabulary.pending.length ? fresh.statusVocabulary : closest.interpretation.statusVocabulary,
      suggestedRowFilter: closest.interpretation.suggestedRowFilter ?? fresh?.suggestedRowFilter,
      warnings: [`Reutilicé la interpretación guardada; ${pendingHeaders.length} columnas nuevas o distintas se interpretaron de nuevo.`, ...(fresh?.warnings ?? [])],
    }
    reused = 'partial'
  } else {
    interpretation = await interpretWithAi(grid, grid.headers, clientContext, inventory)
  }
  interpretation = normalizeInterpretation(grid, interpretation)
  return { interpretationId: '', headersHash: hash, interpretation, reused }
}

export async function confirmInterpretation(clientId: string, grid: SheetGrid, interpretation: SheetInterpretation, userId: string) {
  return saveInterpretation(clientId, headersHash(grid.headers), grid.headers, normalizeInterpretation(grid, interpretation), userId)
}

export const instructionOverridesSchema = z.object({
  items: z.array(z.object({
    key: z.string(),
    adNameMode: z.enum(['today', 'literal']).nullable(),
    adName: z.string().nullable(),
    primaryText: z.string().nullable(),
    headline: z.string().nullable(),
    cta: z.string().nullable(),
    url: z.string().nullable(),
    notes: z.string().nullable(),
  })),
})
