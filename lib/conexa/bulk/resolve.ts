import { baseNameOf, ratioFromDimensions, ratioFromName } from '@/lib/bulk/group-assets'
import {
  ACTION_LABELS, ANSWER_CREATE, ANSWER_EXCLUDE, CANONICAL_ACTIONS,
  type CanonicalAction, type DriveFileRef, type InstructionChip, type InstructionOverrides, type InventoryAccount, type InventoryAdset, type InventoryCampaign, type ItemState, type PieceComparison, type PlanAd, type PlanAdset,
  type PlacementCampaignOption, type PlacementCheck, type PlanAnswer, type PlanBadge, type PlanCampaign, type PlanContext, type PlanIssue, type PlanOverrides, type PlanQuestion, type PlanRow, type ResolvedPlan, type Role,
} from './types'
import { campaignNameKey, cleanValue, containsText, hashText, isBlankValue, normalizeText, sameCampaignName, sameText, splitInstructions } from './text'
import { assignPlacements, classifyFiles, duplicatedFormats, fileFormat, type FormatFile } from './formats'

type Cells = { rowNumber: number; cells: string[]; driveIds: string[][] }
type Resolved = { value?: string; values?: string[]; text?: string; label?: string; note?: string }
type QuestionInput = Omit<PlanQuestion, 'rowNumbers' | 'answered' | 'answer' | 'answerLabel' | 'note' | 'searchable' | 'allowFree' | 'freePlaceholder'> & Partial<Pick<PlanQuestion, 'searchable' | 'allowFree' | 'freePlaceholder'>>

export const accountLabel = (accounts: InventoryAccount[], id?: string) => accounts.find((account) => account.id === id)?.name ?? id ?? 'Sin cuenta'
export const ratioLabel = (file: DriveFileRef): string => fileFormat(file) ?? ratioFromName(file.name) ?? ratioFromDimensions(file.width, file.height)
export const instructionsKey = (text: string) => hashText(normalizeText(text))
export const copyKey = (rowNumber: number, piece: string) => `${rowNumber}:${normalizeText(piece)}`
export const campaignMatchKey = (accountId: string, name: string) => `${accountId}::${campaignNameKey(name)}`

const RANK: ItemState[] = ['ready', 'needs_confirmation', 'needs_answer', 'blocked']
const worst = (states: ItemState[]): ItemState => states.reduce<ItemState>((acc, state) => (RANK.indexOf(state) > RANK.indexOf(acc) ? state : acc), 'ready')
const excludeOption = (rows = 1) => ({ value: ANSWER_EXCLUDE, label: rows > 1 ? 'Excluir las filas' : 'Excluir fila' })
const SPECIAL = new Set([ANSWER_EXCLUDE, ANSWER_CREATE])
// Meta reports multi-destination messaging adsets as e.g. MESSAGING_MESSENGER_WHATSAPP; none of them need a link.
const NO_URL_DESTINATION = /WHATSAPP|MESSENGER|INSTAGRAM_DIRECT|ON_AD|PHONE_CALL/i

export function destinationUrl(value?: string | null) {
  const text = (value ?? '').trim()
  if (!text) return ''
  const explicit = text.match(/https?:\/\/[^\s"'<>]+/i)
  if (explicit) return explicit[0]
  const domain = text.match(/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?$/i)
  return domain ? `https://${domain[0]}` : ''
}

function resolveAnswer(question: Pick<PlanQuestion, 'kind' | 'options' | 'folderFiles'>, answer?: PlanAnswer): Resolved {
  if (!answer) return {}
  if (question.kind === 'files' && answer.groups && question.folderFiles) {
    const byId = new Map(question.folderFiles.files.map((file) => [file.id, file]))
    const groups = answer.groups.filter((group) => group.length)
    if (!groups.length) return { note: 'Dejá al menos un archivo en un anuncio, o excluí la fila' }
    if (groups.some((group) => group.some((id) => !byId.has(id)))) return { note: 'Los archivos de la carpeta cambiaron: volvé a armar los anuncios' }
    if (groups.some((group) => new Set(group.map((id) => byId.get(id)!.format)).size !== group.length)) return { note: 'Cada anuncio puede tener un solo archivo por formato' }
    const used = groups.flat().length
    const excluded = question.folderFiles.files.length - used
    return { value: 'groups', label: `${groups.length} ${groups.length > 1 ? 'anuncios' : 'anuncio'}${excluded ? ` · ${excluded} excluido${excluded > 1 ? 's' : ''}` : ''}` }
  }
  if (question.kind === 'text') return answer.text?.trim() ? { text: answer.text.trim(), label: answer.text.trim() } : {}
  if (question.kind === 'multi') {
    const values = (answer.values ?? []).filter((value) => question.options.some((option) => option.value === value))
    return values.length ? { values, label: question.options.filter((option) => values.includes(option.value)).map((option) => option.label).join(', ') } : {}
  }
  const picked = question.options.find((option) => option.value === answer.value)
  if (picked) return { value: picked.value, label: picked.label }
  const text = answer.text?.trim()
  if (!text) return {}
  const hits = question.options.filter((option) => !SPECIAL.has(option.value) && containsText(option.label, text))
  if (hits.length === 1) return { value: hits[0].value, label: hits[0].label }
  return { note: hits.length ? `"${text}" coincide con ${hits.length} opciones: elegí una` : `No encontré "${text}" entre las opciones` }
}

export function destinationHint(text: string) {
  const key = normalizeText(text)
  if (/whats|wsp|wpp|mensaje/.test(key)) return 'WHATSAPP'
  if (/lead|formulario|\bform\b/.test(key)) return 'ON_AD'
  if (/trafico|web|sitio|landing/.test(key)) return 'WEBSITE'
  return undefined
}

const DESTINATION_LABEL: Record<string, string> = { WHATSAPP: 'WhatsApp', ON_AD: 'formulario', WEBSITE: 'sitio web' }

const MODALITY_PATTERN = /convencional|plan( de)? ahorro|\bplan\b|ahorro|contado|financiad|leasing|usad|0 ?km/
const OBJECTIVES_BY_DESTINATION: Record<string, string[]> = {
  WHATSAPP: ['OUTCOME_ENGAGEMENT', 'OUTCOME_SALES', 'OUTCOME_LEADS', 'OUTCOME_TRAFFIC', 'MESSAGES'],
  ON_AD: ['OUTCOME_LEADS', 'LEAD_GENERATION'],
  WEBSITE: ['OUTCOME_TRAFFIC', 'OUTCOME_SALES', 'OUTCOME_LEADS', 'OUTCOME_ENGAGEMENT', 'LINK_CLICKS', 'CONVERSIONS'],
}
const nameTokens = (value: string) => normalizeText(value).split(/[^a-z0-9]+/).filter(Boolean)

// Coincide por palabra completa o por las abreviaturas que usa la cuenta: prefijo ("CON" = CONVENCIONAL),
// iniciales ("PDA"/"PA" = PLAN DE AHORRO) o una palabra significativa ("AHORRO").
export function attributeMatches(name: string, value: string) {
  const key = normalizeText(value)
  if (!key) return false
  const hay = nameTokens(name)
  const words = nameTokens(key)
  if (!words.length) return false
  const joined = ` ${hay.join(' ')} `
  if (joined.includes(` ${words.join(' ')} `)) return true
  const significant = words.filter((word) => word.length > 2)
  const initials = words.length > 1 ? [words.map((word) => word[0]).join(''), significant.map((word) => word[0]).join('')] : []
  return hay.some((token) =>
    (words.length === 1 && /^[a-z]{3,}$/.test(token) && key.startsWith(token))
    || initials.includes(token)
    || (significant.length > 1 && significant.some((word) => word.length >= 4 && token === word)))
}

export const destinationLabel = (adset: Pick<InventoryAdset, 'destination' | 'whatsappNumber' | 'pageId'>) => {
  if (adset.destination === 'WHATSAPP') return `WhatsApp${adset.whatsappNumber ? `: ${adset.whatsappNumber}` : adset.pageId ? ` (página ${adset.pageId})` : ''}`
  if (adset.destination === 'ON_AD') return 'Formulario instantáneo'
  if (adset.destination === 'WEBSITE') return 'Sitio web'
  if (adset.destination === 'MESSENGER') return 'Messenger'
  return adset.destination || 'Sin destino'
}

// Mismas validaciones de conjunto que en 2.2.b: destino, objetivo, ubicaciones vs. formatos y fecha de fin.
export function adsetChecks(adset: InventoryAdset, campaign: InventoryCampaign | undefined, hint: string | undefined, formats: string[], now = Date.now()): PlacementCheck[] {
  const label = destinationLabel(adset)
  const destination = hint
    ? { label: 'Destino', ok: adset.destination === hint, detail: adset.destination === hint ? label : `La fila pide ${DESTINATION_LABEL[hint]} y el conjunto usa ${label}` }
    : { label: 'Destino', ok: Boolean(adset.destination), detail: adset.destination ? label : 'El conjunto no tiene destino configurado' }
  const allowed = OBJECTIVES_BY_DESTINATION[adset.destination]
  const objectiveOk = !campaign?.objective || !allowed || allowed.includes(campaign.objective)
  const objective = { label: 'Objetivo', ok: objectiveOk, detail: objectiveOk ? campaign?.objective || 'Sin objetivo informado' : `${campaign?.objective} no admite destino ${label}` }
  const positions = adset.positions ?? []
  const vertical = formats.includes('9:16')
  const feed = formats.some((format) => format !== '9:16')
  const hasVerticalSlot = positions.some((position) => /story|reels/.test(position))
  const hasFeedSlot = positions.some((position) => /feed|stream|explore|marketplace|search|video_feeds/.test(position))
  const missing = [vertical && !hasVerticalSlot ? '9:16 (historias/reels)' : '', feed && !hasFeedSlot ? 'feed' : ''].filter(Boolean)
  const placements = !positions.length
    ? { label: 'Ubicaciones', ok: true, detail: 'Automáticas: admiten todos los formatos' }
    : { label: 'Ubicaciones', ok: !missing.length, detail: missing.length ? `Las ubicaciones del conjunto no incluyen ${missing.join(' ni ')}` : `${positions.length} ubicaciones compatibles con ${formats.join(', ') || 'los formatos'}` }
  const end = adset.endTime ? Date.parse(adset.endTime) : NaN
  const endDate = Number.isNaN(end)
    ? { label: 'Fecha de fin', ok: true, detail: 'Sin fecha de fin' }
    : { label: 'Fecha de fin', ok: end > now, detail: end > now ? `Termina el ${new Date(end).toLocaleDateString('es-AR')}` : `Terminó el ${new Date(end).toLocaleDateString('es-AR')}` }
  return [destination, objective, placements, endDate]
}
export function expandAbbreviation(value: string, names: string[]) {
  const key = normalizeText(value)
  if (!/^[a-z0-9]{2,}$/.test(key)) return value
  const words = names.flatMap((name) => name.split(/[^\p{L}\p{N}]+/u)).filter(Boolean)
  if (words.some((word) => normalizeText(word) === key)) return value
  const hits = [...new Set(words.filter((word) => normalizeText(word).startsWith(key)).map((word) => word.toUpperCase()))]
  return hits.length === 1 ? hits[0] : value
}

export const nameHasModel = (name: string, model: string) => {
  const key = normalizeText(model)
  return attributeMatches(name, model) || (key.length >= 3 && nameTokens(name).some((token) => token.startsWith(key)))
}

const SEPARATORS = [' - ', ' | ', ' / ', '_', '-']

// Sugiere un nombre siguiendo la nomenclatura del lote: separador más usado + tramo inicial común + atributos de la fila.
function suggestName(pool: string[], extra: string[], fallback: string) {
  const names = pool.filter(Boolean)
  if (!names.length) return [...new Set(extra.filter(Boolean))].join(' - ') || fallback
  const separator = [...SEPARATORS].sort((a, b) => names.join('').split(b).length - names.join('').split(a).length)[0]
  const parts = names.map((name) => name.split(separator).map((part) => part.trim()).filter(Boolean))
  const prefix: string[] = []
  const shortest = Math.min(...parts.map((item) => item.length))
  for (let index = 0; index < shortest - (names.length === 1 ? 1 : 0); index++) {
    if (parts.every((item) => sameText(item[index], parts[0][index]))) prefix.push(parts[0][index])
    else break
  }
  const tail = extra.filter((value) => value && !prefix.some((part) => sameText(part, value)))
  const result = [...prefix, ...tail]
  return result.length ? result.join(separator) : fallback
}

export function resolvePlan(context: PlanContext, overrides: PlanOverrides = {}): ResolvedPlan {
  const { inventory, grid, interpretation } = context
  const roles = new Map<Role, number[]>()
  for (const column of interpretation.columns) {
    const index = grid.headers.indexOf(column.header)
    if (index < 0 || column.role === 'ignore') continue
    roles.set(column.role, [...(roles.get(column.role) ?? []), index])
  }
  const cell = (row: Cells, role: Role) => (roles.get(role)?.[0] !== undefined ? cleanValue(row.cells[roles.get(role)![0]]) : '')
  const cellsOf = (row: Cells, role: Role) => (roles.get(role) ?? []).map((index) => cleanValue(row.cells[index])).filter(Boolean)
  // "Part" en la columna de modelo es "PARTNER" si así aparece en la campaña o el conjunto de la misma fila.
  const expandIn = (row: Cells, value: string) => expandAbbreviation(value, [cell(row, 'campaign_name'), cell(row, 'adset_name')])
  const attributeAt = (row: Cells, index: number) => expandIn(row, cleanValue(row.cells[index]))
  const attributesOf = (row: Cells) => (roles.get('attribute') ?? []).map((index) => attributeAt(row, index)).filter(Boolean)
  const linkIds = (row: Cells) => {
    const columns = roles.get('creatives_link')
    return [...new Set(columns ? columns.flatMap((index) => row.driveIds[index] ?? []) : row.driveIds.flat())]
  }
  // Una fila es un pedido solo si trae campaña, conjunto o link de creativos; atributos sueltos son relleno de plantilla.
  const isIgnored = (row: Cells) => !cell(row, 'campaign_name') && !cell(row, 'adset_name') && !cellsOf(row, 'creatives_link').length && !(roles.has('creatives_link') && linkIds(row).length)

  // "EN REVISIÓN" es lo que Conexa escribe al terminar una fila: nunca vuelve a contar como pendiente.
  const pending = interpretation.statusVocabulary.pending.filter((value) => !isBlankValue(value)).map(normalizeText).filter((value) => value !== 'en revision')
  const statusIndex = roles.get('status')?.[0]
  const filter = context.rowFilter
  const filterIndex = filter ? grid.headers.indexOf(filter.column) : -1
  const filterValues = filter?.values.filter((value) => !isBlankValue(value)).map(normalizeText) ?? []
  const filterUsable = filterIndex >= 0 && filterValues.length > 0 && (statusIndex === undefined || filterIndex === statusIndex)
  // Sin estado no se excluye: la fila entra con una pregunta.
  const isFilteredOut = (row: Cells) => {
    if (filterUsable) {
      const value = cleanValue(row.cells[filterIndex])
      return Boolean(value) && !filterValues.includes(normalizeText(value))
    }
    if (statusIndex !== undefined && pending.length) {
      const value = cell(row, 'status')
      return Boolean(value) && !pending.includes(normalizeText(value))
    }
    return false
  }

  const vocabulary = Object.fromEntries(Object.entries(interpretation.actionVocabulary).map(([key, value]) => [normalizeText(key), value]))
  const excluded = new Set(overrides.excludedRows ?? [])
  const answers = overrides.answers ?? {}
  const accounts = inventory.accounts
  const campaignsIn = (accountId: string) => inventory.campaigns.filter((campaign) => campaign.accountId === accountId)
  const adsetsOf = (campaignId: string) => inventory.adsets.filter((adset) => adset.campaignId === campaignId)
  const batchAdsetNames = grid.rows.map((row) => cell(row, 'adset_name')).filter(Boolean)

  // Modalidad y unidad se reconocen por el contenido de las columnas de atributo, no por el encabezado.
  const attributeColumns = roles.get('attribute') ?? []
  const valuesOf = (index: number) => [...new Set(grid.rows.filter((row) => !isIgnored(row)).map((row) => attributeAt(row, index)).filter(Boolean))]
  const share = (values: string[], test: (value: string) => boolean) => (values.length ? values.filter(test).length / values.length : 0)
  const modalityColumn = attributeColumns.find((index) => share(valuesOf(index), (value) => MODALITY_PATTERN.test(normalizeText(value))) >= 0.5)
  const inventoryNames = [...inventory.campaigns.map((campaign) => campaign.name), ...inventory.adsets.map((adset) => adset.name)]
  const unitColumn = attributeColumns
    .filter((index) => index !== modalityColumn)
    .map((index) => {
      const values = valuesOf(index)
      const isBrand = share(values, (value) => accounts.some((account) => containsText(account.name, value))) >= 0.5
      const isLong = values.reduce((sum, value) => sum + value.length, 0) / Math.max(values.length, 1) > 30
      return { index, score: isBrand || isLong ? -1 : share(values, (value) => inventoryNames.some((name) => attributeMatches(name, value))) }
    })
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score)[0]?.index
  const modelOf = (row: Cells) => (unitColumn !== undefined ? attributeAt(row, unitColumn) || undefined : undefined)

  // Misma carpeta de Drive en filas con distinta marca o modelo: probablemente un link copiado de más.
  const signatureOf = (row: Cells) => attributesOf(row).map(normalizeText).sort().join('|')
  const rowsByFolder = new Map<string, Cells[]>()
  for (const row of grid.rows) {
    if (isIgnored(row) || isFilteredOut(row) || excluded.has(row.rowNumber)) continue
    for (const id of linkIds(row)) rowsByFolder.set(id, [...(rowsByFolder.get(id) ?? []), row])
  }
  const sharedFolderRows = (row: Cells) => [...new Set(linkIds(row).flatMap((id) => rowsByFolder.get(id) ?? [])
    .filter((other) => other.rowNumber !== row.rowNumber && signatureOf(other) !== signatureOf(row)).map((other) => other.rowNumber))].sort((a, b) => a - b)
  const leadForms = new Map<string, { leadFormId?: string; pending: boolean }>()
  const placementQuestions: string[] = []
  const placementGroups = new Map<string, number[]>()

  const campaigns = new Map<string, PlanCampaign>()
  const adsets = new Map<string, PlanAdset>()
  const rows: PlanRow[] = []
  const ads: PlanAd[] = []
  const questions = new Map<string, PlanQuestion>()
  const resolvedAnswers = new Map<string, Resolved>()

  // Registra la pregunta (o suma la fila si ya existe) y devuelve la respuesta solo si resuelve algo.
  function ask(input: QuestionInput, rowNumber: number, legacy?: PlanAnswer): Resolved | undefined {
    const current = questions.get(input.id)
    if (current) {
      if (!current.rowNumbers.includes(rowNumber)) current.rowNumbers.push(rowNumber)
      return current.answered ? resolvedAnswers.get(input.id) : undefined
    }
    const raw = answers[input.id] ?? legacy
    const resolved = resolveAnswer(input, raw)
    const answered = Boolean((resolved.value && resolved.value !== ANSWER_EXCLUDE) || resolved.values?.length || resolved.text)
    questions.set(input.id, {
      searchable: input.options.length > 8, allowFree: true, freePlaceholder: 'Otra respuesta…', ...input,
      rowNumbers: [rowNumber], answered, answer: raw, answerLabel: resolved.label, note: resolved.note,
    })
    resolvedAnswers.set(input.id, resolved)
    return answered ? resolved : undefined
  }
  const addRowToTarget = (targetKey: string, rowNumber: number) => {
    for (const question of questions.values()) if (question.targetKey === targetKey && !question.rowNumbers.includes(rowNumber)) question.rowNumbers.push(rowNumber)
  }

  function resolveAccount(row: Cells, active: boolean): Pick<PlanRow, 'accountId' | 'accountStatus' | 'accountReason' | 'accountCandidates'> {
    const manual = overrides.accountByRow?.[row.rowNumber]
    if (manual) return { accountId: manual, accountStatus: 'resolved', accountReason: `Cuenta elegida a mano: ${accountLabel(accounts, manual)}`, accountCandidates: [] }
    const value = cell(row, 'account')
    const unresolved = (reason: string, candidates: InventoryAccount[]): ReturnType<typeof resolveAccount> => {
      const base = { accountStatus: 'account_unresolved' as const, accountReason: reason, accountCandidates: candidates }
      if (!active) return base
      const ordered = [...candidates, ...accounts.filter((account) => !candidates.some((item) => item.id === account.id))]
      const answer = ask({
        id: value ? `account:${normalizeText(value)}` : `account:row:${row.rowNumber}`, kind: 'choice', field: 'Cuenta',
        prompt: value ? `¿Qué cuenta publicitaria es "${value}"?` : `¿En qué cuenta publicitaria va la fila ${row.rowNumber}?`, why: reason,
        options: [...ordered.map((account) => ({ value: account.id, label: account.name, hint: candidates.some((item) => item.id === account.id) && candidates.length < accounts.length ? 'coincide' : undefined })), excludeOption()],
        target: 'row', targetKey: String(row.rowNumber), freePlaceholder: 'Escribí parte del nombre de la cuenta…', reuse: value ? { kind: 'alias', alias: value } : undefined,
      }, row.rowNumber)
      return answer?.value ? { accountId: answer.value, accountStatus: 'resolved', accountReason: `Respondiste: ${answer.label}${value ? ' (se guarda como alias)' : ''}`, accountCandidates: [] } : base
    }
    if (value) {
      const alias = context.aliases[normalizeText(value)]
      if (alias && accounts.some((account) => account.id === alias)) return { accountId: alias, accountStatus: 'resolved', accountReason: `Cuenta resuelta por alias guardado: "${value}" → ${accountLabel(accounts, alias)}`, accountCandidates: [] }
      const matches = accounts.filter((account) => containsText(account.name, value))
      if (matches.length === 1) return { accountId: matches[0].id, accountStatus: 'resolved', accountReason: `Cuenta resuelta: el nombre contiene "${value}"`, accountCandidates: [] }
      return unresolved(matches.length ? `"${value}" coincide con ${matches.length} cuentas` : `Ninguna cuenta contiene "${value}"`, matches)
    }
    if (accounts.length === 1) return { accountId: accounts[0].id, accountStatus: 'resolved', accountReason: 'Es la única cuenta conectada del cliente', accountCandidates: [] }
    const campaignName = cell(row, 'campaign_name')
    const owners = [...new Set(inventory.campaigns.filter((campaign) => sameCampaignName(campaign.name, campaignName)).map((campaign) => campaign.accountId))]
    if (owners.length === 1) return { accountId: owners[0], accountStatus: 'resolved', accountReason: 'La campaña ya existe en esta cuenta', accountCandidates: [] }
    const attributes = attributesOf(row)
    if (attributes.length) {
      const scores = accounts.map((account) => ({
        account,
        score: attributes.reduce((sum, attribute) => sum + (containsText(account.name, attribute) ? 5 : 0) + campaignsIn(account.id).filter((campaign) => containsText(campaign.name, attribute)).length, 0),
      })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score)
      if (scores.length === 1 || (scores.length > 1 && scores[0].score > scores[1].score * 2)) {
        return { accountId: scores[0].account.id, accountStatus: 'resolved', accountReason: `Cuenta inferida por "${attributes.join(' · ')}": tiene campañas de esa marca`, accountCandidates: [] }
      }
      if (scores.length) return unresolved(`Más de una cuenta tiene campañas de "${attributes.join(' · ')}"`, scores.map((item) => item.account))
    }
    return unresolved('No hay columna de cuenta y no pude inferirla', [])
  }

  function existingCampaign(row: Cells, campaign: InventoryCampaign, reason: string): PlanCampaign {
    const key = campaignMatchKey(campaign.accountId, campaign.name)
    const current = campaigns.get(key)
    if (current) {
      if (!current.rows.includes(row.rowNumber)) current.rows.push(row.rowNumber)
      addRowToTarget(key, row.rowNumber)
      return current
    }
    const plan: PlanCampaign = {
      key, accountId: campaign.accountId, name: campaign.name, mode: 'existing', existingId: campaign.id, status: 'exists', candidates: [], isCbo: campaign.isCbo,
      meta: { id: campaign.id, name: campaign.name, status: campaign.status, match: 'exacta' },
      dailyBudget: campaign.dailyBudget, rows: [row.rowNumber], reason: `${reason} · ID ${campaign.id} · ${campaign.status}`, state: 'ready', issues: [],
    }
    campaigns.set(key, plan)
    return plan
  }

  // Nunca asume que una campaña existe ni la crea: o la encuentra en Meta o pregunta con candidatas.
  function ensureCampaign(row: Cells, accountId: string, name: string): PlanCampaign {
    const key = campaignMatchKey(accountId, name)
    const existing = campaigns.get(key)
    if (existing) {
      if (!existing.rows.includes(row.rowNumber)) existing.rows.push(row.rowNumber)
      addRowToTarget(key, row.rowNumber)
      return existing
    }
    const accountName = accountLabel(accounts, accountId)
    const base = { key, accountId, name, rows: [row.rowNumber], issues: [] as PlanIssue[] }
    const found = (campaign: InventoryCampaign, match: NonNullable<PlanCampaign['meta']>['match'], reason: string): PlanCampaign => ({
      ...base, accountId: campaign.accountId, mode: 'existing', existingId: campaign.id, status: campaign.accountId === accountId ? 'exists' : 'exists_other_account',
      candidates: [], isCbo: campaign.isCbo, dailyBudget: campaign.dailyBudget, meta: { id: campaign.id, name: campaign.name, status: campaign.status, match },
      reason: `${reason} · ID ${campaign.id} · ${campaign.status}`, state: 'ready',
    })
    const pool = campaignsIn(accountId)
    const local = pool.find((campaign) => sameText(campaign.name, name)) ?? pool.find((campaign) => sameCampaignName(campaign.name, name))
    if (local) {
      const exact = sameText(local.name, name)
      const plan = found(local, exact ? 'exacta' : 'normalizada', `En Meta (${accountName}): "${local.name}"${exact ? '' : ' — coincide ignorando separadores, tildes y O/0'}`)
      campaigns.set(key, plan)
      return plan
    }

    const wanted = new Set([name, ...attributesOf(row)].flatMap((value) => campaignNameKey(value).split(' ')).filter((token) => token.length > 1))
    const score = (campaign: InventoryCampaign) => campaignNameKey(campaign.name).split(' ').filter((token) => wanted.has(token)).length
    const byStatus = (a: InventoryCampaign, b: InventoryCampaign) => Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE') || a.name.localeCompare(b.name)
    const elsewhere = inventory.campaigns.filter((campaign) => campaign.accountId !== accountId && sameCampaignName(campaign.name, name))
    const semantic = (context.semanticMatches[key] ?? []).map((id) => inventory.campaigns.find((campaign) => campaign.id === id)).filter((item): item is InventoryCampaign => Boolean(item))
    const similar = pool.map((campaign) => ({ campaign, score: score(campaign) })).filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || byStatus(a.campaign, b.campaign)).slice(0, 8).map((item) => item.campaign)
    const candidates = [...elsewhere, ...semantic, ...similar].filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index)
    const rest = pool.filter((campaign) => !candidates.some((item) => item.id === campaign.id)).sort(byStatus)

    // La campaña nueva copia la configuración (objetivo, optimización) de la más parecida de la misma cuenta.
    const reference = candidates.find((item) => item.accountId === accountId) ?? [...pool].sort(byStatus)[0]
    const legacy = overrides.campaignDecision?.[key]
    const legacyAnswer = legacy === 'create' ? { value: ANSWER_CREATE } : legacy && legacy !== 'use_existing' ? { value: legacy.startsWith('use:') ? legacy : `use:${legacy}` } : undefined
    const decision = ask({
      id: `campaign:${key}`, kind: 'choice', field: 'Campaña',
      prompt: `No encontré la campaña "${name}" en Meta (${accountName}). ¿Cuál es?`,
      why: candidates.length
        ? `Busqué entre las ${pool.length} campañas activas y pausadas de la cuenta; arriba están las más parecidas y abajo todas las demás`
        : `Ninguna de las ${pool.length} campañas activas y pausadas de la cuenta se parece; elegí de la lista completa`,
      options: [
        { value: ANSWER_CREATE, label: `Crear campaña nueva "${name}"`, hint: reference ? `en pausa · copia la configuración de "${reference.name}"` : 'la cuenta no tiene campañas para copiar' },
        ...candidates.map((item) => ({ value: `use:${item.id}`, label: item.name, hint: `${item.accountId === accountId ? 'parecida' : accountLabel(accounts, item.accountId)} · ${item.status} · ID ${item.id}` })),
        ...rest.map((item) => ({ value: `use:${item.id}`, label: item.name, hint: `otra de la cuenta · ${item.status}` })),
        excludeOption(),
      ],
      searchable: true, target: 'campaign', targetKey: key, freePlaceholder: 'Buscar entre todas las campañas de la cuenta…',
    }, row.rowNumber, legacyAnswer)?.value
    const used = decision?.startsWith('use:') ? inventory.campaigns.find((campaign) => campaign.id === decision.slice(4)) : undefined
    const plan: PlanCampaign = used
      ? found(used, 'elegida', `Respondiste: "${used.name}" en ${accountLabel(accounts, used.accountId)}`)
      : decision === ANSWER_CREATE
        ? {
            ...base, mode: 'create', status: 'create', candidates: [], isCbo: reference?.isCbo ?? false, dailyBudget: reference?.dailyBudget,
            reference: reference ? { id: reference.id, name: reference.name, objective: reference.objective } : undefined,
            reason: reference ? `Respondiste: crear "${name}" en pausa, copiando la configuración de "${reference.name}"` : `Respondiste: crear "${name}"`,
            state: reference ? 'ready' : 'blocked',
            issues: reference ? [] : [{ field: 'Campaña de referencia', message: 'La cuenta no tiene campañas de las que copiar la configuración', where: 'Creá una campaña base en Meta o elegí una existente' }],
          }
      : {
          ...base, mode: 'existing', status: 'not_found', isCbo: false, state: 'needs_answer',
          candidates: candidates.map(({ id, name: candidate, accountId: owner }) => ({ id, name: candidate, accountId: owner })),
          reason: `No existe en Meta (${accountName}): la fila no avanza hasta que elijas la campaña`,
        }
    campaigns.set(key, plan)
    return plan
  }

  function ensureAdsets(row: Cells, campaign: PlanCampaign, hint?: string, placeInModelAdset?: boolean): PlanAdset[] {
    const adsetName = cell(row, 'adset_name')
    const existingAdsets = campaign.existingId ? adsetsOf(campaign.existingId) : []
    const options = existingAdsets.map(({ id, name, status }) => ({ id, name, status }))
    const adsetOptions = existingAdsets.map((adset) => ({ value: adset.id, label: adset.name, hint: adset.status === 'ACTIVE' ? 'activo' : 'pausado' }))
    const register = (plan: PlanAdset) => {
      const current = adsets.get(plan.key)
      if (current) {
        if (!current.rows.includes(row.rowNumber)) current.rows.push(row.rowNumber)
        addRowToTarget(plan.key, row.rowNumber)
        return current
      }
      adsets.set(plan.key, plan)
      return plan
    }
    const existingPlan = (adset: InventoryAdset, reason: string): PlanAdset => ({
      key: `${campaign.accountId}::adset::${adset.id}`, campaignKey: campaign.key, accountId: campaign.accountId, name: adset.name, mode: 'existing', existingIds: [adset.id], options,
      pageId: adset.pageId, destination: adset.destination, rows: [row.rowNumber], reason, state: 'ready', issues: [],
    })

    if (campaign.mode === 'existing') {
      if (adsetName) {
        const match = existingAdsets.find((adset) => sameCampaignName(adset.name, adsetName))
        if (match) return [register(existingPlan(match, 'Conjunto encontrado por nombre exacto'))]
        const answer = ask({
          id: `adset:${campaign.key}::${normalizeText(adsetName)}`, kind: 'choice', field: 'Conjunto',
          prompt: `No encontré el conjunto "${adsetName}" en "${campaign.name}". ¿Dónde cargo los anuncios?`,
          why: existingAdsets.length ? `La campaña tiene ${existingAdsets.length} conjuntos y ninguno se llama así` : 'La campaña no tiene conjuntos',
          options: [...adsetOptions, { value: ANSWER_CREATE, label: `Crear "${adsetName}" nuevo en esta campaña`, hint: 'en pausa' }, excludeOption()],
          target: 'campaign', targetKey: campaign.key, freePlaceholder: 'Escribí el nombre de otro conjunto…',
        }, row.rowNumber)
        if (!answer?.value) return []
        const chosen = existingAdsets.find((adset) => adset.id === answer.value)
        if (chosen) return [register(existingPlan(chosen, `Respondiste: se carga en "${chosen.name}"`))]
      } else if (placeInModelAdset && existingAdsets.length) {
        const model = modelOf(row)
        const candidates = model ? existingAdsets.filter((adset) => nameHasModel(adset.name, model)) : []
        if (candidates.length === 1) return [register(existingPlan(candidates[0], `Instrucción: conjunto del modelo "${model}"`))]
        const ordered = [...candidates, ...existingAdsets.filter((adset) => !candidates.includes(adset))]
        const answer = ask({
          id: `model-adset:${campaign.key}::${normalizeText(model ?? '')}`, kind: 'choice', field: 'Conjunto',
          prompt: !model ? `La fila no indica modelo. ¿En qué conjunto de "${campaign.name}" creo los anuncios?`
            : candidates.length ? `Hay ${candidates.length} conjuntos de "${model}" en "${campaign.name}". ¿En cuál creo los anuncios?`
            : `No encontré un conjunto de "${model}" en "${campaign.name}". ¿En cuál creo los anuncios?`,
          why: 'La instrucción pide crear los anuncios en el conjunto del modelo',
          options: [...ordered.map((adset) => ({ value: adset.id, label: adset.name, hint: candidates.includes(adset) ? 'coincide' : adset.status === 'ACTIVE' ? 'activo' : 'pausado' })), excludeOption()],
          target: 'campaign', targetKey: campaign.key, freePlaceholder: 'Escribí parte del nombre del conjunto…',
        }, row.rowNumber)
        const chosen = existingAdsets.find((adset) => adset.id === answer?.value)
        return chosen ? [register(existingPlan(chosen, `Respondiste: se carga en "${chosen.name}"`))] : []
      } else if (existingAdsets.length) {
        // Sin columna de conjunto se localiza el existente con los atributos de la fila; crear uno nuevo es solo elección explícita.
        const active = existingAdsets.filter((adset) => adset.status === 'ACTIVE')
        if (active.length === 1) return [register(existingPlan(active[0], 'La campaña tiene un solo conjunto activo'))]
        if (!active.length && existingAdsets.length === 1) return [register(existingPlan(existingAdsets[0], 'La campaña tiene un solo conjunto'))]
        const pool = active.length ? active : existingAdsets
        const attributes = [...new Set(attributesOf(row).map(normalizeText).filter((value) => value.length > 1))]
        const scored = pool.map((adset) => {
          const names = [adset.name, ...inventory.ads.filter((ad) => ad.adsetId === adset.id && ad.status === 'ACTIVE').map((ad) => ad.name)].map(normalizeText)
          const hits = attributes.filter((value) => names.some((name) => ` ${name} `.includes(` ${value} `) || nameHasModel(name, value)))
          return { adset, hits }
        }).sort((a, b) => b.hits.length - a.hits.length || Number(b.adset.status === 'ACTIVE') - Number(a.adset.status === 'ACTIVE'))
        const [best, second] = scored
        if (best && best.hits.length > 0 && best.hits.length > (second?.hits.length ?? 0)) {
          return [register(existingPlan(best.adset, `Conjunto elegido por coincidencia con ${best.hits.map((hit) => `"${hit.toUpperCase()}"`).join(', ')}`))]
        }
        const answer = ask({
          id: `adset-choice:${campaign.key}::${attributes.join('|')}`, kind: 'choice', field: 'Conjunto',
          prompt: `¿En cuál de estos conjuntos de "${campaign.name}" cargo los anuncios?`,
          why: best?.hits.length ? `Varios conjuntos coinciden con los datos de la fila (${best.hits.join(', ')})` : `Hay ${pool.length} conjuntos${active.length ? ' activos' : ''} y ninguno coincide claramente con los datos de la fila`,
          options: [
            ...scored.map(({ adset, hits }) => ({ value: adset.id, label: adset.name, hint: hits.length ? `coincide: ${hits.join(', ')}` : adset.status === 'ACTIVE' ? 'activo' : 'pausado' })),
            { value: ANSWER_CREATE, label: 'Crear conjunto nuevo', hint: 'en pausa' },
            excludeOption(),
          ],
          target: 'campaign', targetKey: campaign.key, freePlaceholder: 'Escribí parte del nombre del conjunto…',
        }, row.rowNumber)
        if (!answer?.value) return []
        const chosen = existingAdsets.find((adset) => adset.id === answer.value)
        if (chosen) return [register(existingPlan(chosen, `Respondiste: se carga en "${chosen.name}"`))]
        if (answer.value !== ANSWER_CREATE) return []
      }
    }

    let name = adsetName
    if (!name) {
      const answer = ask({
        id: `adset-name:${campaign.key}`, kind: 'text', field: 'Nombre del conjunto',
        prompt: `¿Qué nombre uso para el conjunto nuevo en "${campaign.name}"?`,
        why: campaign.mode === 'existing' ? 'Elegiste crear un conjunto nuevo en esta campaña' : 'La campaña es nueva y la fila no indica conjunto',
        options: [], suggestion: suggestName(batchAdsetNames, attributesOf(row), campaign.name),
        target: 'campaign', targetKey: campaign.key, freePlaceholder: 'Nombre del conjunto',
      }, row.rowNumber)
      if (!answer?.text) return []
      name = answer.text
    }

    const key = `${campaign.key}::new::${normalizeText(name)}`
    const field = overrides.fields?.[key]
    const pool = campaign.mode === 'existing' ? existingAdsets : campaign.reference ? adsetsOf(campaign.reference.id) : []
    let reference: InventoryAdset | undefined = (field?.referenceAdsetId && inventory.adsets.find((adset) => adset.id === field.referenceAdsetId && adset.accountId === campaign.accountId))
      || [...pool].sort((a, b) => Number(b.destination === hint) - Number(a.destination === hint) || Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE'))[0]
    const issues: PlanIssue[] = []
    let state: ItemState = 'ready'
    const accountAdsets = inventory.adsets.filter((adset) => adset.accountId === campaign.accountId)
    if (!reference && accountAdsets.length) {
      const answer = ask({
        id: `adset-ref:${key}`, kind: 'choice', field: 'Conjunto de referencia',
        prompt: `¿De qué conjunto copio segmentación, ubicaciones y optimización para "${name}"?`,
        why: campaign.mode === 'existing' ? 'La campaña no tiene conjuntos para copiar' : 'La campaña de referencia no tiene conjuntos',
        options: [...accountAdsets.map((adset) => ({ value: adset.id, label: adset.name, hint: adset.destination })), excludeOption()],
        target: 'adset', targetKey: key, freePlaceholder: 'Buscar conjunto por nombre…',
      }, row.rowNumber)
      reference = accountAdsets.find((adset) => adset.id === answer?.value)
      if (!reference) state = 'needs_answer'
    } else if (!reference) issues.push({ field: 'Conjunto de referencia', message: 'La cuenta no tiene conjuntos de los que copiar segmentación', where: 'Creá un conjunto base en Meta o excluí la fila' })
    const dailyBudget = field?.dailyBudget ?? reference?.dailyBudget
    if (!campaign.isCbo && !dailyBudget) issues.push({ field: 'Presupuesto del conjunto', message: 'Falta el presupuesto diario', where: 'Completá el presupuesto en este ítem' })
    if (reference?.destination === 'WEBSITE' && reference.optimizationGoal === 'OFFSITE_CONVERSIONS' && !reference.hasPixel) issues.push({ field: 'Píxel', message: 'La referencia optimiza conversiones sin píxel', where: 'Elegí otra referencia' })
    return [register({
      key, campaignKey: campaign.key, accountId: campaign.accountId, name, mode: 'create', existingIds: [], options, rows: [row.rowNumber],
      reference: reference ? { id: reference.id, name: reference.name } : undefined, dailyBudget, pageId: field?.pageId ?? reference?.pageId, destination: reference?.destination,
      reason: reference ? `Copia la configuración de "${reference.name}"` : 'Se crea un conjunto nuevo',
      issues, state: issues.length ? 'blocked' : state,
    })]
  }

  // 2.2.b: la fila no trae campaña. Se ubica por el conjunto existente; si no aparece, la fila queda bloqueada.
  function placeWithoutCampaign(row: Cells, accountId: string, hint: string | undefined, formats: string[]): { campaign: PlanCampaign; targets: PlanAdset[] } | { issue: PlanIssue } | undefined {
    const adsetName = cell(row, 'adset_name')
    const matches = adsetName ? inventory.adsets.filter((adset) => adset.accountId === accountId && sameCampaignName(adset.name, adsetName)) : []
    const campaignOf = (adset: InventoryAdset) => inventory.campaigns.find((campaign) => campaign.id === adset.campaignId)
    const useExisting = (adset: InventoryAdset, reason: string, campaignReason = `Campaña del conjunto "${adset.name}"`) => {
      const owner = campaignOf(adset)
      if (!owner) return undefined
      const campaign = existingCampaign(row, owner, campaignReason)
      const key = `${campaign.accountId}::adset::${adset.id}`
      const current = adsets.get(key)
      if (current) {
        if (!current.rows.includes(row.rowNumber)) current.rows.push(row.rowNumber)
        return { campaign, targets: [current] }
      }
      const plan: PlanAdset = {
        key, campaignKey: campaign.key, accountId: campaign.accountId, name: adset.name, mode: 'existing', existingIds: [adset.id], options: [],
        pageId: adset.pageId, destination: adset.destination, rows: [row.rowNumber], reason, state: 'ready', issues: [],
      }
      adsets.set(key, plan)
      return { campaign, targets: [plan] }
    }

    if (matches.length === 1) return useExisting(matches[0], 'La fila no trae campaña: se encontró el conjunto por nombre exacto')
    if (matches.length > 1) {
      const answer = ask({
        id: `adset-pick:${row.rowNumber}`, kind: 'choice', field: 'Conjunto',
        prompt: `Hay ${matches.length} conjuntos "${adsetName}" en la cuenta. ¿Cuál es?`,
        why: 'La fila no trae campaña y el nombre del conjunto se repite',
        options: [...matches.map((adset) => ({ value: adset.id, label: adset.name, hint: campaignOf(adset)?.name })), excludeOption()],
        target: 'row', targetKey: String(row.rowNumber),
      }, row.rowNumber)
      const chosen = matches.find((adset) => adset.id === answer?.value)
      return chosen ? useExisting(chosen, `Respondiste: conjunto de "${campaignOf(chosen)?.name ?? ''}"`) : undefined
    }

    // Sin campaña ni conjunto reconocible: se pregunta dónde cargar, con las campañas de la cuenta ordenadas por modalidad y unidad.
    const modality = modalityColumn !== undefined ? attributeAt(row, modalityColumn) || undefined : undefined
    const unit = modelOf(row)
    const maxScore = Number(Boolean(modality)) + Number(Boolean(unit))
    const scoreOf = (...names: string[]) => Number(Boolean(modality && names.some((name) => attributeMatches(name, modality)))) + Number(Boolean(unit && names.some((name) => attributeMatches(name, unit))))
    const options: PlacementCampaignOption[] = campaignsIn(accountId)
      .map((campaign) => {
        const list = adsetsOf(campaign.id).map((adset) => ({
          id: adset.id, name: adset.name, status: adset.status, destinationLabel: destinationLabel(adset),
          score: scoreOf(campaign.name, adset.name), checks: adsetChecks(adset, campaign, hint, formats),
        })).sort((a, b) => b.score - a.score || Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE') || a.name.localeCompare(b.name))
        return { id: campaign.id, name: campaign.name, status: campaign.status, objective: campaign.objective, score: Math.max(scoreOf(campaign.name), ...list.map((adset) => adset.score)), adsets: list }
      })
      .filter((campaign) => campaign.adsets.length)
      .sort((a, b) => b.score - a.score || Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE') || a.name.localeCompare(b.name))
    if (!options.length) {
      return { issue: { field: 'Campaña', message: 'La fila no trae campaña y la cuenta no tiene campañas con conjuntos', where: `Completá la campaña en la fila ${row.rowNumber} del sheet o excluí la fila` } }
    }

    const groupKey = `${accountId}::${normalizeText(modality ?? '')}::${normalizeText(unit ?? '')}`
    const groupQuestionId = `placement-group:${groupKey}`
    placementGroups.set(groupKey, [...(placementGroups.get(groupKey) ?? []), row.rowNumber])
    const questionId = `placement:${row.rowNumber}`
    placementQuestions.push(questionId)
    const filterLabel = [modality, unit].filter(Boolean).join(' / ')
    const matched = options.some((campaign) => campaign.score > 0)
    const answer = ask({
      id: questionId, kind: 'placement', field: 'Campaña y conjunto',
      prompt: adsetName ? `La fila no trae campaña y no existe el conjunto "${adsetName}". ¿Dónde cargo los anuncios?` : 'La fila no trae campaña ni conjunto. ¿Dónde cargo los anuncios?',
      why: !filterLabel ? `Elegí una campaña o un conjunto de ${accountLabel(accounts, accountId)}` : matched ? `Filtré por ${filterLabel} en ${accountLabel(accounts, accountId)}` : `No encontré campañas con ${filterLabel} en esta cuenta`,
      options: [
        ...options.flatMap((campaign) => [
          { value: `campaign:${campaign.id}`, label: campaign.name },
          ...campaign.adsets.map((adset) => ({ value: adset.id, label: `${campaign.name} › ${adset.name}` })),
        ]),
        excludeOption(),
      ],
      placement: { accountName: accountLabel(accounts, accountId), modality, unit, maxScore, matched, campaigns: options, groupQuestionId, groupRows: [] },
      target: 'row', targetKey: String(row.rowNumber), searchable: false, allowFree: false,
    }, row.rowNumber, answers[groupQuestionId])
    if (!answer?.value) return undefined

    const accountAdsets = inventory.adsets.filter((adset) => adset.accountId === accountId)
    let chosen = accountAdsets.find((adset) => adset.id === answer.value)
    if (!chosen && answer.value.startsWith('campaign:')) {
      const list = adsetsOf(answer.value.slice(9))
      const active = list.filter((adset) => adset.status === 'ACTIVE')
      chosen = active.length === 1 ? active[0] : !active.length && list.length === 1 ? list[0] : undefined
    }
    if (!chosen) {
      const question = questions.get(questionId)
      if (question) {
        question.answered = false
        question.note = 'Esa campaña tiene varios conjuntos activos: elegí uno'
      }
      return undefined
    }
    const placed = useExisting(chosen, 'Campaña y conjunto elegidos manualmente', 'Campaña y conjunto elegidos manualmente')
    if (!placed) return undefined
    const failed = adsetChecks(chosen, campaignOf(chosen), hint, formats).filter((check) => !check.ok)
    for (const target of placed.targets) {
      for (const check of failed) {
        if (!target.issues.some((issue) => issue.field === check.label)) target.issues.push({ field: check.label, message: check.detail, where: 'Elegí otro conjunto en la pregunta "Campaña y conjunto" o excluí la fila' })
      }
      if (target.issues.length) target.state = 'blocked'
    }
    return placed
  }

  // Formulario instantáneo de los anuncios activos del conjunto; se pregunta si hay varios o ninguno.
  function leadFormFor(adset: PlanAdset, rowNumber: number) {
    const cached = leadForms.get(adset.key)
    if (cached) {
      if (cached.pending) ask({ id: `lead-form:${adset.key}`, kind: 'choice', field: 'Formulario', prompt: '', why: '', options: [], target: 'adset', targetKey: adset.key }, rowNumber)
      return cached
    }
    const running = inventory.ads.filter((ad) => adset.existingIds.includes(ad.adsetId) && ad.status === 'ACTIVE' && ad.leadFormId)
    const forms = [...new Set(running.map((ad) => ad.leadFormId!))]
    if (forms.length === 1) {
      const result = { leadFormId: forms[0], pending: false }
      leadForms.set(adset.key, result)
      return result
    }
    const accountForms = [...new Set(inventory.ads.filter((ad) => ad.accountId === adset.accountId && ad.leadFormId).map((ad) => ad.leadFormId!))]
    const pool = forms.length ? forms : accountForms
    const usedBy = (id: string) => inventory.ads.filter((ad) => ad.leadFormId === id).map((ad) => ad.name).slice(0, 2).join(', ')
    const answer = ask({
      id: `lead-form:${adset.key}`, kind: pool.length ? 'choice' : 'text', field: 'Formulario',
      prompt: `¿Qué formulario instantáneo uso en los anuncios nuevos de "${adset.name}"?`,
      why: forms.length ? `Los anuncios activos del conjunto usan ${forms.length} formularios distintos` : 'El conjunto no tiene anuncios activos con formulario',
      options: pool.length ? [...pool.map((id) => ({ value: id, label: `Formulario ${id}`, hint: usedBy(id) })), excludeOption()] : [],
      target: 'adset', targetKey: adset.key, freePlaceholder: 'ID del formulario instantáneo',
    }, rowNumber)
    const result = { leadFormId: answer?.value || answer?.text, pending: !answer }
    leadForms.set(adset.key, result)
    return result
  }

  // Una carpeta = un anuncio, con un archivo por formato. Si hay formatos repetidos, la persona arma los anuncios.
  type Piece = { key: string; label: string; files: FormatFile[]; ignored: Array<{ name: string; reason: string }> }
  function piecesOf(row: Cells) {
    const ids = [...new Set(linkIds(row))]
    const error = ids.map((id) => context.drive[id]?.error).find(Boolean)
    const pieces: Piece[] = []
    const ignoredAll: Array<{ name: string; reason: string }> = []
    let pending = false
    const seen = new Set<string>()
    ids.forEach((folderId, folderIndex) => {
      const raw = (context.drive[folderId]?.files ?? []).filter((file) => !seen.has(file.id)).sort((a, b) => a.name.localeCompare(b.name))
      raw.forEach((file) => seen.add(file.id))
      const { valid, ignored } = classifyFiles(raw)
      const skipped = ignored.map(({ file, reason }) => ({ name: file.name, reason }))
      ignoredAll.push(...skipped)
      if (!valid.length) return
      const label = baseNameOf(valid[0].name) || `Carpeta ${folderIndex + 1}`
      const duplicated = duplicatedFormats(valid)
      if (!duplicated.length) {
        pieces.push({ key: folderId, label, files: valid, ignored: skipped })
        return
      }
      const questionId = `folder-files:${row.rowNumber}:${folderId}`
      const folderLabel = ids.length > 1 ? `La carpeta ${folderIndex + 1}` : 'La carpeta'
      const answer = ask({
        id: questionId, kind: 'files', field: 'Creativos',
        prompt: `${folderLabel} tiene más de un archivo ${duplicated.join(', ')}. ¿Cómo armo los anuncios?`,
        why: 'Cada carpeta es un anuncio con un archivo por formato, y acá hay formatos repetidos',
        options: [excludeOption()], target: 'row', targetKey: String(row.rowNumber), allowFree: false,
        folderFiles: { folderLabel, duplicated, files: valid.map((file) => ({ id: file.id, name: file.name, format: file.format, kind: file.mimeType.startsWith('video/') ? 'video' : 'image' })) },
      }, row.rowNumber)
      const groups = answer?.value === 'groups' ? (answers[questionId]?.groups ?? []).filter((group) => group.length) : undefined
      if (!groups) { pending = true; return }
      const byId = new Map(valid.map((file) => [file.id, file]))
      groups.forEach((group, index) => pieces.push({
        key: groups.length > 1 ? `${folderId}#${index + 1}` : folderId,
        label: groups.length > 1 ? `${label} (${index + 1})` : label,
        files: group.map((id) => byId.get(id)!),
        ignored: index === 0 ? skipped : [],
      }))
    })
    return { hasLink: ids.length > 0, error, pieces, ignored: ignoredAll, pending }
  }

  function compare(piece: string, files: DriveFileRef[], adset: PlanAdset): { comparison: PieceComparison; match?: PlanAd['match'] } {
    if (adset.mode === 'create' || !adset.existingIds.length) return { comparison: 'new' }
    const adsetAds = inventory.ads.filter((ad) => adset.existingIds.includes(ad.adsetId))
    const adIds = new Set(adsetAds.map((ad) => ad.id))
    const records = context.sources.filter((source) => adIds.has(source.adId))
    const recorded = files.map((file) => ({ file, record: records.find((source) => source.driveFileId === file.id) }))
    const formats = files.map(ratioLabel)
    if (recorded.some((item) => item.record)) {
      const ad = adsetAds.find((item) => item.id === recorded.find((entry) => entry.record)!.record!.adId)!
      const adFormats = records.filter((source) => source.adId === ad.id).map((source) => source.format)
      const match = { adId: ad.id, name: ad.name, thumbnail: ad.thumbnail, formats: adFormats, certain: true }
      if (recorded.some((item) => item.record && item.file.modifiedTime && item.record.driveModifiedTime && item.file.modifiedTime !== item.record.driveModifiedTime)) return { comparison: 'changed', match }
      return { comparison: formats.some((format) => !adFormats.includes(format)) ? 'missing_formats' : 'unchanged', match }
    }
    const key = normalizeText(piece)
    const byName = key.length >= 3 ? adsetAds.filter((ad) => normalizeText(ad.name).includes(key) || normalizeText(ad.creativeName ?? '').includes(key)) : []
    if (!byName.length) return { comparison: 'new' }
    const adFormats: string[] = [...new Set(byName.map((ad) => ratioFromName(ad.name) ?? ratioFromName(ad.creativeName ?? '')).filter((value): value is NonNullable<typeof value> => Boolean(value)))]
    const match = { adId: byName[0].id, name: byName[0].name, thumbnail: byName[0].thumbnail, formats: adFormats, certain: false }
    return { comparison: adFormats.length && formats.some((format) => !adFormats.includes(format)) ? 'missing_formats' : 'unchanged', match }
  }

  for (const row of grid.rows) {
    const ignored = isIgnored(row)
    const filteredOut = !ignored && isFilteredOut(row)
    const active = !ignored && !filteredOut && !excluded.has(row.rowNumber)
    const account: ReturnType<typeof resolveAccount> = ignored
      ? { accountStatus: 'account_unresolved', accountReason: 'Fila vacía: no se procesa', accountCandidates: [] }
      : resolveAccount(row, active)
    const rawAction = cell(row, 'action')
    // "Activar" significa procesar el pedido: la acción se infiere de lo que exista en Meta.
    const processOnly = /^activ/.test(normalizeText(rawAction))
    const sheetAction: CanonicalAction | undefined = roles.has('action') && !processOnly ? (vocabulary[normalizeText(rawAction)] ?? (rawAction ? 'unknown' : undefined)) : undefined
    const manualAction = overrides.actionByRow?.[row.rowNumber]
    const planRow: PlanRow = {
      rowNumber: row.rowNumber, excluded: excluded.has(row.rowNumber), filteredOut, ignored, ...account,
      action: manualAction ?? sheetAction ?? 'create', actionSource: manualAction ? 'manual' : sheetAction ? 'sheet' : 'inferred', state: 'ready', issues: [],
    }
    rows.push(planRow)
    if (!active) continue

    if (statusIndex !== undefined && !cell(row, 'status')) {
      ask({
        id: `no-status:${row.rowNumber}`, kind: 'choice', field: 'Estado',
        prompt: 'Esta fila no tiene estado, ¿la proceso?', why: `La fila ${row.rowNumber} tiene contenido pero la columna de estado está vacía`,
        options: [{ value: 'process', label: 'Sí, procesarla' }, excludeOption()],
        target: 'row', targetKey: String(row.rowNumber), allowFree: false,
      }, row.rowNumber)
    }

    if (planRow.action === 'unknown') {
      const answer = ask({
        id: `action:${normalizeText(rawAction)}`, kind: 'choice', field: 'Acción',
        prompt: `¿Qué significa la acción "${rawAction}"?`, why: 'No está en el vocabulario de acciones de este sheet',
        options: [...CANONICAL_ACTIONS.filter((action) => action !== 'unknown').map((action) => ({ value: action, label: ACTION_LABELS[action] })), excludeOption()],
        target: 'row', targetKey: String(row.rowNumber), allowFree: false, reuse: { kind: 'action', value: rawAction },
      }, row.rowNumber)
      if (answer?.value) {
        planRow.action = answer.value as CanonicalAction
        planRow.actionSource = 'sheet'
      }
    }

    const campaignName = cell(row, 'campaign_name')
    const { hasLink, error, pieces, ignored: ignoredFiles, pending: piecesPending } = piecesOf(row)
    if (!hasLink) planRow.issues.push({ field: 'Creativos', message: 'La fila no tiene link de Drive', where: `Fila ${row.rowNumber} del sheet` })
    else if (!pieces.length && !piecesPending) planRow.issues.push({
      field: 'Creativos',
      message: error ?? (ignoredFiles.length ? `Archivos ignorados: ${ignoredFiles.map((file) => `${file.name} (${file.reason})`).join(', ')}` : 'La carpeta de Drive no tiene imágenes ni videos compatibles'),
      where: 'Formatos válidos: 1:1, 4:5, 9:16 o 16:9 en JPG, PNG, MP4 o MOV',
    })
    planRow.driveError = error
    planRow.state = worst(planRow.issues.map(() => 'blocked' as const))
    const sharedWith = sharedFolderRows(row)
    if (sharedWith.length) {
      ask({
        id: `folder:${row.rowNumber}`, kind: 'choice', field: 'Creativos',
        prompt: `Esta carpeta también está en ${sharedWith.length > 1 ? 'las filas' : 'la fila'} ${sharedWith.join(', ')}. ¿Es correcto?`,
        why: 'La misma carpeta de Drive aparece en filas con distinta marca o modelo',
        options: [{ value: 'confirm', label: 'Sí, es correcto' }, excludeOption()],
        target: 'row', targetKey: String(row.rowNumber), allowFree: false,
      }, row.rowNumber)
    }
    if (!planRow.accountId) continue

    // Cada instrucción se clasifica; una no entendida frena la fila hasta que el equipo la aclare.
    const instructionCells = cellsOf(row, 'instructions')
    const instructions = instructionCells.join(' · ')
    const chips: InstructionChip[] = []
    const applied: InstructionOverrides[] = []
    let instructionPending = false
    for (const text of [...new Set(instructionCells.flatMap(splitInstructions))]) {
      const key = instructionsKey(text)
      const parsed = context.instructionOverrides[key]
      const saved = context.interpretation.instructionNotes?.[key]
      const { status: _status, meaning, contradicts, ...fields } = parsed ?? {}
      const hasFields = Object.values(fields).some((value) => value !== undefined && value !== '')
      const status = saved?.decision === 'ignore' ? 'ignored' : contradicts ? 'contradicts' : parsed?.status ?? 'unclear'
      if (status === 'ignored') { chips.push({ text, status, detail: 'El equipo indicó ignorar esta instrucción' }); continue }
      if (status === 'contradicts') {
        chips.push({ text, status, detail: 'No se aplica: todo lo nuevo se crea en pausa' })
        planRow.issues.push({ field: 'Instrucciones', message: `"${text}" no se aplica: todo lo nuevo se crea en pausa`, where: 'Columna de instrucciones' })
        if (hasFields) applied.push(fields)
        continue
      }
      if (status === 'no_effect') { chips.push({ text, status, detail: meaning || 'Ya se cumple por regla general' }); continue }
      if (status === 'applied' || saved?.decision === 'apply' || saved?.decision === 'clarified') {
        chips.push({ text, status: 'applied', detail: meaning || (saved?.clarification ? `Según tu aclaración: ${saved.clarification}` : 'Aplicada') })
        applied.push(fields)
        continue
      }
      const answer = ask({
        id: `instruction:${key}`, kind: 'choice', field: 'Instrucción',
        prompt: `No entendí la instrucción "${text}". ¿Qué hago?`,
        why: meaning ? `Creo que significa: ${meaning}` : 'No tengo una interpretación clara de esta instrucción',
        options: [...(meaning ? [{ value: 'apply', label: 'Sí, aplicalo así', hint: meaning }] : []), { value: 'ignore', label: 'Ignorar esta instrucción' }, excludeOption()],
        target: 'row', targetKey: String(row.rowNumber), freePlaceholder: 'Aclarar qué significa…', reuse: { kind: 'instruction', key, text },
      }, row.rowNumber)
      if (answer?.value === 'apply') { chips.push({ text, status: 'applied', detail: meaning ?? 'Aplicada' }); applied.push(fields) }
      else if (answer?.value === 'ignore') chips.push({ text, status: 'ignored', detail: 'Elegiste ignorarla' })
      else if (answer?.text) chips.push({ text, status: 'applied', detail: `Según tu aclaración: ${answer.text}. Se reinterpreta con la aclaración en la próxima lectura del sheet.` })
      else { chips.push({ text, status: 'unclear', detail: meaning ? `Hipótesis: ${meaning}` : 'Sin interpretación' }); instructionPending = true }
    }
    if (chips.length) planRow.instructions = chips
    if (instructionPending) {
      planRow.state = 'needs_answer'
      continue
    }
    const instruction: InstructionOverrides = Object.assign({}, ...applied)
    const hint = destinationHint([campaignName, ...attributesOf(row), instructions].join(' '))

    let campaign: PlanCampaign
    let targets: PlanAdset[]
    if (campaignName) {
      campaign = ensureCampaign(row, planRow.accountId, campaignName)
      if (campaign.mode === 'create' && campaign.status === 'create' && !manualAction && (planRow.action === 'replace' || planRow.action === 'add_formats')) {
        planRow.actionWarning = `La acción dice "${rawAction}" pero la campaña no existe`
        const answer = ask({
          id: `action-conflict:${row.rowNumber}`, kind: 'choice', field: 'Acción',
          prompt: `La fila pide "${rawAction}" pero la campaña "${campaignName}" no existe. ¿Qué hago?`, why: planRow.actionWarning,
          options: [{ value: 'create', label: 'Crear la campaña y los anuncios' }, excludeOption()],
          target: 'row', targetKey: String(row.rowNumber), allowFree: false,
        }, row.rowNumber)
        if (answer?.value === 'create') {
          planRow.action = 'create'
          planRow.actionSource = 'manual'
          planRow.actionWarning = undefined
        }
      }
      targets = campaign.state === 'needs_answer' ? [] : ensureAdsets(row, campaign, hint, instruction.placeInModelAdset)
    } else {
      const formats = [...new Set(pieces.flatMap((piece) => piece.files.map((file) => file.format)))]
      const placed = placeWithoutCampaign(row, planRow.accountId, hint, formats)
      if (!placed) continue
      if ('issue' in placed) {
        planRow.issues.push(placed.issue)
        planRow.state = 'blocked'
        continue
      }
      campaign = placed.campaign
      targets = placed.targets
    }
    planRow.campaignKey = campaign.key
    planRow.adsetKey = targets[0]?.key

    for (const adset of targets) {
      const leadFormId = instruction.reuseLeadForm ? leadFormFor(adset, row.rowNumber).leadFormId : undefined
      for (const { key: folderKey, label: piece, files, ignored: pieceIgnored } of pieces) {
        const pieceKey = `${row.rowNumber}:${folderKey}:${adset.key}`
        const placements = assignPlacements(files)
        let { comparison, match } = compare(piece, files, adset)
        if (match && !match.certain) {
          const legacy = overrides.pieceMatch?.[pieceKey]
          const answer = ask({
            id: `piece:${pieceKey}`, kind: 'choice', field: 'Pieza',
            prompt: `¿"${piece}" es la misma pieza que el anuncio "${match.name}"?`,
            why: 'Coinciden por nombre, pero no hay registro de que ese anuncio use estos archivos de Drive',
            options: [{ value: 'confirm', label: 'Sí, es la misma' }, { value: 'reject', label: 'No, es una pieza nueva' }, excludeOption()],
            target: 'ad', targetKey: pieceKey, allowFree: false,
          }, row.rowNumber, legacy ? { value: legacy } : undefined)
          if (answer?.value === 'reject') {
            comparison = 'new'
            match = undefined
          }
        }
        const pendingMatch = Boolean(match && !match.certain && !questions.get(`piece:${pieceKey}`)?.answered)
        const effective: CanonicalAction = planRow.actionSource === 'inferred'
          ? (adset.mode === 'create' || campaign.mode === 'create' ? 'create' : comparison === 'changed' ? 'replace' : comparison === 'missing_formats' ? 'add_formats' : comparison === 'unchanged' ? 'skip' : 'create')
          : planRow.action === 'replace' ? (comparison === 'unchanged' && match?.certain ? 'skip' : 'replace')
          : planRow.action === 'add_formats' ? (comparison === 'missing_formats' ? 'add_formats' : 'skip')
          : planRow.action
        const badge: PlanBadge = effective === 'skip' || effective === 'unknown' ? 'Sin cambios' : effective === 'replace' ? 'Nuevo (reemplaza creativos)' : effective === 'add_formats' ? 'Nuevo (formatos faltantes)' : 'Crear anuncio'
        const formats = files.map(ratioLabel)

        const reuseCopy = (effective === 'replace' || effective === 'add_formats') && match ? inventory.ads.find((ad) => ad.id === match!.adId) : undefined
        const generated = context.generatedCopy[copyKey(row.rowNumber, piece)]
        const primaryText = instruction.primaryText || cell(row, 'primary_text') || reuseCopy?.primaryText || (effective === 'create' ? generated?.primaryText : '') || ''
        const headline = instruction.headline || cell(row, 'headline') || reuseCopy?.headline || (effective === 'create' ? generated?.headline : '') || ''
        const aiCopy = Boolean(generated && effective === 'create' && !instruction.primaryText && !cell(row, 'primary_text') && primaryText === generated.primaryText)

        // El sufijo _{n} se agrega al final, solo si el mismo nombre se repite en el conjunto.
        const name = instruction.adNameMode === 'today' ? context.today : instruction.adName || cell(row, 'ad_name') || piece

        const issues: PlanIssue[] = []
        const pageId = adset.pageId ?? context.pageIds[0]
        if (badge !== 'Sin cambios' && !pageId) issues.push({ field: 'Página', message: 'No hay página de Facebook para el anuncio', where: 'Asigná la página del cliente en Meta Ads' })
        const url = destinationUrl(instruction.url) || destinationUrl(cell(row, 'url')) || destinationUrl(context.batchDefaults.url)
        if (badge !== 'Sin cambios' && !NO_URL_DESTINATION.test(adset.destination ?? '') && !leadFormId && !url) issues.push({ field: 'URL', message: 'Falta la URL de destino', where: 'Valores por defecto del lote o Contexto del cliente' })

        const why = effective === 'skip' ? (match ? `Ya existe "${match.name}" con esta pieza: sin cambios` : 'La acción del sheet no aplica a esta pieza')
          : effective === 'add_formats' ? `En Drive hay ${formats.filter((format) => !match?.formats.includes(format)).join(', ')} que el anuncio actual no tiene: se crea un anuncio nuevo`
          : effective === 'replace' ? (match ? `Creativo nuevo para "${match.name}": se crea un anuncio nuevo y el anterior queda como está` : 'Se crea un anuncio nuevo con los creativos de Drive')
          : adset.mode === 'create' ? 'Va dentro del conjunto nuevo' : 'La pieza no está en el conjunto: se crea un anuncio nuevo'

        ads.push({
          id: pieceKey, rowNumber: row.rowNumber, accountId: campaign.accountId, campaignKey: campaign.key, adsetKey: adset.key, piece, files, formats, comparison, match,
          slots: Object.fromEntries(placements.slots), placementWarnings: placements.warnings, ignoredFiles: pieceIgnored,
          action: effective, badge, name, primaryText, headline, aiCopy,
          cta: instruction.cta || cell(row, 'cta') || context.batchDefaults.cta, url, leadFormId,
          reason: pendingMatch ? 'Esperando tu respuesta sobre la coincidencia' : why,
          state: issues.length ? 'blocked' : 'ready', issues,
          idempotencyKey: hashText([context.spreadsheetId, row.rowNumber, normalizeText(piece), adset.key, files.map((file) => `${file.id}@${file.modifiedTime ?? ''}`).join(',')].join('|')),
        })
      }
    }
  }

  const sameName = new Map<string, PlanAd[]>()
  for (const ad of ads) {
    if (ad.badge === 'Sin cambios') continue
    const key = `${ad.adsetKey}::${normalizeText(ad.name)}`
    sameName.set(key, [...(sameName.get(key) ?? []), ad])
  }
  for (const group of sameName.values()) if (group.length > 1) group.forEach((ad, index) => { ad.name = `${ad.name}_${index + 1}` })

  for (const id of placementQuestions) {
    const payload = questions.get(id)?.placement
    if (payload) payload.groupRows = placementGroups.get(payload.groupQuestionId.slice('placement-group:'.length)) ?? []
  }

  const questionList = [...questions.values()]
  const pendingList = questionList.filter((question) => !question.answered)
  const rowByNumber = new Map(rows.map((row) => [row.rowNumber, row]))
  for (const question of pendingList) {
    const pendingState: ItemState = question.id.startsWith('folder:') ? 'needs_confirmation' : 'needs_answer'
    for (const rowNumber of question.rowNumbers) {
      const row = rowByNumber.get(rowNumber)
      if (row) row.state = worst([row.state, pendingState])
    }
    if (question.target === 'campaign') {
      const campaign = campaigns.get(question.targetKey)
      if (campaign) campaign.state = worst([campaign.state, 'needs_answer'])
    } else if (question.target === 'adset') {
      const adset = adsets.get(question.targetKey)
      if (adset) adset.state = worst([adset.state, 'needs_answer'])
    } else if (question.target === 'ad') {
      const ad = ads.find((item) => item.id === question.targetKey)
      if (ad) ad.state = worst([ad.state, 'needs_answer'])
    }
  }

  const included = rows.filter(isIncluded)
  const acting = ads.filter((ad) => ad.badge !== 'Sin cambios')
  const campaignList = [...campaigns.values()]
  const adsetList = [...adsets.values()]
  return {
    rows, campaigns: campaignList, adsets: adsetList, ads, questions: questionList,
    summary: {
      read: rows.length, processed: included.length, pendingQuestions: pendingList.length, filtered: rows.filter((row) => row.filteredOut).length,
      excluded: rows.filter((row) => row.excluded && !row.ignored).length, ignored: rows.filter((row) => row.ignored).length,
      newCampaigns: campaignList.filter((item) => item.mode === 'create' && item.state !== 'needs_answer').length,
      newAdsets: adsetList.filter((item) => item.mode === 'create').length,
      newAds: acting.length, replace: acting.filter((ad) => ad.badge === 'Nuevo (reemplaza creativos)').length, addFormats: acting.filter((ad) => ad.badge === 'Nuevo (formatos faltantes)').length,
      unchanged: ads.length - acting.length,
    },
  }
}

// Preguntas sin responder que afectan filas incluidas: mientras haya alguna, no se avanza ni se crea nada.
export const isIncluded = (row: PlanRow) => !row.excluded && !row.filteredOut && !row.ignored

export const pendingQuestions = (plan: ResolvedPlan) => {
  const included = new Set(plan.rows.filter(isIncluded).map((row) => row.rowNumber))
  return plan.questions.filter((question) => !question.answered && question.rowNumbers.some((rowNumber) => included.has(rowNumber)))
}

// Respuestas que tocan a un anuncio: las de su fila, su campaña, su conjunto y la propia pieza.
export function answersForAd(plan: ResolvedPlan, ad: PlanAd) {
  const related = plan.questions.filter((question) => question.answered && question.answer && (
    question.targetKey === ad.campaignKey || question.targetKey === ad.adsetKey || question.targetKey === ad.id || question.rowNumbers.includes(ad.rowNumber)
  ))
  return Object.fromEntries(related.map((question) => [question.id, question.answer!]))
}

export function planBlockers(plan: ResolvedPlan) {
  const rows = plan.rows.filter(isIncluded)
  const includedRows = new Set(rows.map((row) => row.rowNumber))
  const acting = plan.ads.filter((ad) => ad.badge !== 'Sin cambios' && includedRows.has(ad.rowNumber))
  const campaignKeys = new Set(acting.map((ad) => ad.campaignKey))
  const adsetKeys = new Set(acting.map((ad) => ad.adsetKey))
  const states = [
    ...rows.map((row) => row.state),
    ...plan.campaigns.filter((item) => campaignKeys.has(item.key) || item.state === 'needs_answer').map((item) => item.state),
    ...plan.adsets.filter((item) => adsetKeys.has(item.key) || item.state === 'needs_answer').map((item) => item.state),
    ...plan.ads.filter((ad) => includedRows.has(ad.rowNumber)).map((ad) => ad.state),
  ]
  return {
    blocked: states.filter((state) => state === 'blocked').length,
    needsConfirmation: states.filter((state) => state === 'needs_confirmation').length,
    needsAnswer: pendingQuestions(plan).length,
    actions: acting.length,
  }
}
