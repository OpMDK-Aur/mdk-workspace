import 'server-only'
import { z } from 'zod'
import type { SheetGrid } from '@/lib/bulk/types'
import { resolveDriveLinks } from '@/lib/google/sheet-import'
import { askJson } from './ai'
import { copyFromCreative, creativeCopyInput, mapLimited } from './creative-copy'
import { instructionOverridesSchema } from './interpret'
import { loadAliases, loadCreativeSources } from './persistence'
import { campaignMatchKey, copyKey, instructionsKey, resolvePlan } from './resolve'
import { normalizeText, splitInstructions, todayDDMMYYYY, tokenOverlap } from './text'
import type { Inventory, PlanContext, SheetInterpretation } from './types'

const DRIVE_BATCH = 100
const MAX_COPY_ITEMS = 60

async function loadDrive(token: string, grid: SheetGrid, interpretation: SheetInterpretation) {
  const linkColumns = interpretation.columns.filter((column) => column.role === 'creatives_link').map((column) => grid.headers.indexOf(column.header)).filter((index) => index >= 0)
  const ids = [...new Set(grid.rows.flatMap((row) => (linkColumns.length ? linkColumns.map((index) => row.driveIds[index] ?? []) : row.driveIds).flat()))]
  const drive: PlanContext['drive'] = {}
  for (let index = 0; index < ids.length; index += DRIVE_BATCH) {
    const links = await resolveDriveLinks(token, ids.slice(index, index + DRIVE_BATCH))
    for (const [id, link] of Object.entries(links)) drive[id] = { files: link.files.map((file) => ({ id: file.id, name: file.name, mimeType: file.mimeType, width: file.width, height: file.height })), error: link.error }
  }
  return drive
}

const semanticSchema = z.object({ matches: z.array(z.object({ key: z.string(), campaignIds: z.array(z.string()) })) })

async function semanticMatches(context: PlanContext) {
  const plan = resolvePlan(context)
  const pending = plan.campaigns.filter((campaign) => campaign.status === 'create').map((campaign) => ({
    key: campaign.key,
    name: campaign.name,
    candidates: context.inventory.campaigns.filter((item) => item.accountId === campaign.accountId && tokenOverlap(campaign.name, item.name) >= 2).slice(0, 12).map(({ id, name }) => ({ id, name })),
  })).filter((item) => item.candidates.length)
  if (!pending.length) return {}
  const result = await askJson(semanticSchema,
    'Comparás nombres de campañas de Meta Ads. Para cada campaña pedida devolvé solo los ids de candidatas que sean la MISMA campaña escrita distinto (orden de palabras, abreviaturas, tildes, separadores). Si difiere en marca, modelo, modalidad o destino, no es la misma. Ante la duda, no la incluyas.',
    JSON.stringify(pending), 'la búsqueda de campañas parecidas')
  const valid = new Map(pending.map((item) => [item.key, new Set(item.candidates.map((candidate) => candidate.id))]))
  return Object.fromEntries(result.matches.filter((match) => valid.has(match.key)).map((match) => [match.key, match.campaignIds.filter((id) => valid.get(match.key)!.has(id))]).filter(([, ids]) => ids.length))
}

async function interpretInstructions(context: PlanContext) {
  const columns = context.interpretation.columns.filter((column) => column.role === 'instructions').map((column) => context.grid.headers.indexOf(column.header))
  if (!columns.length) return {}
  const texts = [...new Set(context.grid.rows.flatMap((row) => columns.flatMap((index) => splitInstructions(row.cells[index] ?? ''))))]
  if (!texts.length) return {}
  const notes = context.interpretation.instructionNotes ?? {}
  const items = texts.map((text) => {
    const key = instructionsKey(text)
    const clarification = notes[key]?.decision === 'clarified' ? notes[key]?.clarification : undefined
    return clarification ? { key, text, aclaracion_del_equipo: clarification } : { key, text }
  })
  const result = await askJson(instructionOverridesSchema,
    `Convertís observaciones libres de un pedido de anuncios en overrides estructurados. Cada item es UNA instrucción. Solo completá un campo si la observación lo pide explícitamente.
- status: "applied" si la entendiste y la convertiste en algún campo; "no_effect" si ya se cumple por regla general (ej. "dejar pausado"); "unclear" si no la entendés o es ambigua. Ante la duda, "unclear".
- meaning: en una frase, cómo se aplica (applied/no_effect) o qué creés que significa (unclear). Null si no tenés hipótesis.
- contradicts true: pide algo contrario a las reglas (ej. "dejar activo", "publicar ya"): todo lo nuevo se crea en pausa.
- Si el item trae aclaracion_del_equipo, usala como el significado correcto de la instrucción.
- adNameMode "today": el anuncio debe llamarse con la fecha del día (ej. "nombre del anuncio con fecha de hoy"). Hoy es ${context.today}.
- adName: un nombre literal pedido. primaryText / headline: copy literal pedido. cta / url: si los indica.
- placeInModelAdset true: pide crear los anuncios en el conjunto existente que corresponde al modelo de la fila.
- reuseLeadForm true: pide usar el formulario instantáneo de los anuncios que ya están corriendo en ese conjunto.
- "Dejar pausado" no requiere nada: todo se crea en pausa.
- notes: cualquier otra indicación que no puedas mapear, resumida.`,
    JSON.stringify(items), 'las observaciones del sheet')
  const keys = new Set(items.map((item) => item.key))
  return Object.fromEntries(result.items.filter((item) => keys.has(item.key)).map(({ key, ...rest }) => [key, Object.fromEntries(Object.entries(rest).filter(([, value]) => value != null && value !== ''))]))
}

// El copy sale del creativo principal de cada pieza; la misma pieza en varios conjuntos comparte copy.
async function generateCopy(context: PlanContext, googleToken: string) {
  const plan = resolvePlan(context)
  const targets = [...new Map(plan.ads
    .filter((ad) => ad.action !== 'skip' && ad.action !== 'unknown' && !ad.primaryText && ad.files.length)
    .map((ad) => [copyKey(ad.rowNumber, ad.piece), ad])).entries()].slice(0, MAX_COPY_ITEMS)
  if (!targets.length) return { copy: {}, failed: 0 }
  const results = await mapLimited(targets, async ([key, ad]) => {
    const input = creativeCopyInput(context, plan, ad)
    return [key, input ? await copyFromCreative(googleToken, context.clientContext ?? '', input) : null] as const
  })
  const copy = Object.fromEntries(results.filter(([, value]) => value).map(([key, value]) => [key, value!]))
  return { copy, failed: results.length - Object.keys(copy).length }
}

export async function buildPlanContext(input: {
  planId: string; clientId: string; sheetUrl: string; spreadsheetId: string; googleToken: string; grid: SheetGrid; interpretation: SheetInterpretation
  rowFilter?: PlanContext['rowFilter']; inventory: Inventory; inventoryWarnings: string[]; clientContext: string; batchDefaults: PlanContext['batchDefaults']; pageIds: string[]
}): Promise<PlanContext> {
  const [drive, sources, aliases] = await Promise.all([
    loadDrive(input.googleToken, input.grid, input.interpretation),
    loadCreativeSources(input.inventory.accounts.map((account) => account.id)),
    loadAliases(input.clientId),
  ])
  const context: PlanContext = {
    planId: input.planId, clientId: input.clientId, sheetUrl: input.sheetUrl, spreadsheetId: input.spreadsheetId, sheetTitle: input.grid.sheetTitle,
    grid: input.grid, interpretation: input.interpretation, rowFilter: input.rowFilter, inventory: input.inventory, drive, sources,
    aliases: Object.fromEntries(Object.entries(aliases).map(([alias, id]) => [normalizeText(alias), id])),
    semanticMatches: {}, instructionOverrides: {}, generatedCopy: {}, batchDefaults: input.batchDefaults, pageIds: input.pageIds, today: todayDDMMYYYY(), warnings: [...input.inventoryWarnings],
    clientContext: input.clientContext,
  }

  const [semantic, instructions] = await Promise.allSettled([semanticMatches(context), interpretInstructions(context)])
  if (semantic.status === 'fulfilled') context.semanticMatches = semantic.value
  else context.warnings.push('No pude buscar campañas con nombres parecidos: solo se usó coincidencia exacta.')
  if (instructions.status === 'fulfilled') context.instructionOverrides = instructions.value
  else context.warnings.push('No pude interpretar la columna de observaciones: revisá esos anuncios a mano.')

  try {
    const { copy, failed } = await generateCopy(context, input.googleToken)
    context.generatedCopy = copy
    if (failed) context.warnings.push(`No pude generar el copy de ${failed} pieza${failed > 1 ? 's' : ''} a partir del creativo: completalo o usá "Regenerar" en Configurar anuncios.`)
  } catch {
    context.warnings.push('No pude generar el copy de los anuncios nuevos: completalo en el paso Configurar anuncios.')
  }
  return context
}
