import { baseNameOf, ratioFromDimensions, ratioFromName } from '@/lib/bulk/group-assets'
import type {
  CanonicalAction, DriveFileRef, InstructionOverrides, InventoryAccount, InventoryAdset, InventoryCampaign, ItemState, PieceComparison, PlanAd, PlanAdset,
  PlanBadge, PlanCampaign, PlanContext, PlanIssue, PlanOverrides, PlanRow, ResolvedPlan, Role,
} from './types'
import { containsText, hashText, normalizeText, sameText, tokenOverlap } from './text'

type Cells = { rowNumber: number; cells: string[]; driveIds: string[][] }

export const accountLabel = (accounts: InventoryAccount[], id?: string) => accounts.find((account) => account.id === id)?.name ?? id ?? 'Sin cuenta'
export const ratioLabel = (file: DriveFileRef) => ratioFromName(file.name) ?? ratioFromDimensions(file.width, file.height)
export const instructionsKey = (text: string) => hashText(normalizeText(text))
export const copyKey = (rowNumber: number, piece: string) => `${rowNumber}:${normalizeText(piece)}`
export const campaignMatchKey = (accountId: string, name: string) => `${accountId}::${normalizeText(name)}`

const worst = (states: ItemState[]): ItemState => states.includes('blocked') ? 'blocked' : states.includes('needs_confirmation') ? 'needs_confirmation' : 'ready'

function columnsByRole(context: PlanContext) {
  const byRole = new Map<Role, number[]>()
  for (const column of context.interpretation.columns) {
    const index = context.grid.headers.indexOf(column.header)
    if (index < 0 || column.role === 'ignore') continue
    byRole.set(column.role, [...(byRole.get(column.role) ?? []), index])
  }
  return byRole
}

export function destinationHint(text: string) {
  const key = normalizeText(text)
  if (/whats|wsp|wpp|mensaje/.test(key)) return 'WHATSAPP'
  if (/lead|formulario|\bform\b/.test(key)) return 'ON_AD'
  if (/trafico|web|sitio|landing/.test(key)) return 'WEBSITE'
  return undefined
}

const DESTINATION_LABEL: Record<string, string> = { WHATSAPP: 'WhatsApp', ON_AD: 'formulario', WEBSITE: 'sitio web' }

export function resolvePlan(context: PlanContext, overrides: PlanOverrides = {}): ResolvedPlan {
  const { inventory, grid, interpretation } = context
  const roles = columnsByRole(context)
  const cell = (row: Cells, role: Role) => (roles.get(role)?.[0] !== undefined ? row.cells[roles.get(role)![0]]?.trim() ?? '' : '')
  const cellsOf = (row: Cells, role: Role) => (roles.get(role) ?? []).map((index) => row.cells[index]?.trim() ?? '').filter(Boolean)

  const pending = interpretation.statusVocabulary.pending.map(normalizeText)
  const filter = context.rowFilter
  const filterIndex = filter ? grid.headers.indexOf(filter.column) : -1
  const filterValues = filter?.values.map(normalizeText) ?? []
  const isFilteredOut = (row: Cells) => {
    if (filter && filterIndex >= 0) return filterValues.length > 0 && !filterValues.includes(normalizeText(row.cells[filterIndex] ?? ''))
    if (roles.has('status') && pending.length) return !pending.includes(normalizeText(cell(row, 'status')))
    return false
  }

  const vocabulary = Object.fromEntries(Object.entries(interpretation.actionVocabulary).map(([key, value]) => [normalizeText(key), value]))
  const excluded = new Set(overrides.excludedRows ?? [])
  const accounts = inventory.accounts
  const campaignsIn = (accountId: string) => inventory.campaigns.filter((campaign) => campaign.accountId === accountId)
  const adsetsOf = (campaignId: string) => inventory.adsets.filter((adset) => adset.campaignId === campaignId)

  const campaigns = new Map<string, PlanCampaign>()
  const adsets = new Map<string, PlanAdset>()
  const rows: PlanRow[] = []
  const ads: PlanAd[] = []
  const namesByAdset = new Map<string, Map<string, number>>()

  function resolveAccount(row: Cells): Pick<PlanRow, 'accountId' | 'accountStatus' | 'accountReason' | 'accountCandidates'> {
    const manual = overrides.accountByRow?.[row.rowNumber]
    if (manual) return { accountId: manual, accountStatus: 'resolved', accountReason: `Cuenta elegida a mano: ${accountLabel(accounts, manual)}`, accountCandidates: [] }
    const value = cell(row, 'account')
    if (value) {
      const alias = context.aliases[normalizeText(value)]
      if (alias && accounts.some((account) => account.id === alias)) return { accountId: alias, accountStatus: 'resolved', accountReason: `Cuenta resuelta por alias guardado: "${value}" → ${accountLabel(accounts, alias)}`, accountCandidates: [] }
      const matches = accounts.filter((account) => containsText(account.name, value))
      if (matches.length === 1) return { accountId: matches[0].id, accountStatus: 'resolved', accountReason: `Cuenta resuelta: el nombre contiene "${value}"`, accountCandidates: [] }
      return { accountStatus: 'account_unresolved', accountReason: matches.length ? `"${value}" coincide con ${matches.length} cuentas` : `Ninguna cuenta contiene "${value}"`, accountCandidates: matches.length ? matches : accounts }
    }
    if (accounts.length === 1) return { accountId: accounts[0].id, accountStatus: 'resolved', accountReason: 'Es la única cuenta conectada del cliente', accountCandidates: [] }
    const campaignName = cell(row, 'campaign_name')
    const owners = [...new Set(inventory.campaigns.filter((campaign) => sameText(campaign.name, campaignName)).map((campaign) => campaign.accountId))]
    if (owners.length === 1) return { accountId: owners[0], accountStatus: 'resolved', accountReason: 'La campaña ya existe en esta cuenta', accountCandidates: [] }
    const attributes = cellsOf(row, 'attribute')
    if (attributes.length) {
      const scores = accounts.map((account) => ({
        account,
        score: attributes.reduce((sum, attribute) => sum + (containsText(account.name, attribute) ? 5 : 0) + campaignsIn(account.id).filter((campaign) => containsText(campaign.name, attribute)).length, 0),
      })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score)
      if (scores.length === 1 || (scores.length > 1 && scores[0].score > scores[1].score * 2)) {
        return { accountId: scores[0].account.id, accountStatus: 'resolved', accountReason: `Cuenta inferida por "${attributes.join(' · ')}": tiene campañas de esa marca`, accountCandidates: [] }
      }
      if (scores.length) return { accountStatus: 'account_unresolved', accountReason: `Más de una cuenta tiene campañas de "${attributes.join(' · ')}"`, accountCandidates: scores.map((item) => item.account) }
    }
    return { accountStatus: 'account_unresolved', accountReason: 'No hay columna de cuenta y no pude inferirla', accountCandidates: accounts }
  }

  function pickReference(accountId: string, name: string, hint?: string) {
    const options = campaignsIn(accountId).filter((campaign) => adsetsOf(campaign.id).length)
    const withDestination = hint ? options.filter((campaign) => adsetsOf(campaign.id).some((adset) => adset.destination === hint)) : options
    return [...(withDestination.length ? withDestination : hint ? [] : options)]
      .sort((a, b) => tokenOverlap(name, b.name) - tokenOverlap(name, a.name) || Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE'))[0]
  }

  function ensureCampaign(row: Cells, accountId: string, name: string, hint?: string): PlanCampaign {
    const key = campaignMatchKey(accountId, name)
    const existing = campaigns.get(key)
    if (existing) {
      existing.rows.push(row.rowNumber)
      return existing
    }
    const decision = overrides.campaignDecision?.[key]
    const local = campaignsIn(accountId).find((campaign) => sameText(campaign.name, name))
    const elsewhere = inventory.campaigns.filter((campaign) => campaign.accountId !== accountId && sameText(campaign.name, name))
    const semantic = (context.semanticMatches[key] ?? []).map((id) => inventory.campaigns.find((campaign) => campaign.id === id)).filter((item): item is InventoryCampaign => Boolean(item))
    const useId = decision?.startsWith('use:') ? decision.slice(4) : undefined
    const used = useId ? inventory.campaigns.find((campaign) => campaign.id === useId) : undefined

    const base = { key, accountId, name, rows: [row.rowNumber], issues: [] as PlanIssue[] }
    let plan: PlanCampaign
    if (local) plan = { ...base, mode: 'existing', existingId: local.id, status: 'exists', candidates: [], isCbo: local.isCbo, dailyBudget: local.dailyBudget, reason: `Campaña encontrada por nombre exacto en ${accountLabel(accounts, accountId)}`, state: 'ready' }
    else if (used) plan = { ...base, accountId: used.accountId, mode: 'existing', existingId: used.id, status: elsewhere.some((item) => item.id === used.id) ? 'exists_other_account' : 'possible_match', candidates: [], isCbo: used.isCbo, dailyBudget: used.dailyBudget, reason: `Confirmado: se usa "${used.name}" en ${accountLabel(accounts, used.accountId)}`, state: 'ready' }
    else if (elsewhere.length && decision !== 'create') plan = { ...base, mode: 'create', status: 'exists_other_account', candidates: elsewhere.map(({ id, name: candidate, accountId: owner }) => ({ id, name: candidate, accountId: owner })), isCbo: false, reason: `Existe una campaña con ese nombre en ${elsewhere.map((item) => accountLabel(accounts, item.accountId)).join(', ')}`, state: 'needs_confirmation' }
    else if (semantic.length && decision !== 'create') plan = { ...base, mode: 'create', status: 'possible_match', candidates: semantic.map(({ id, name: candidate, accountId: owner }) => ({ id, name: candidate, accountId: owner })), isCbo: false, reason: `Posible coincidencia: "${semantic[0].name}"`, state: 'needs_confirmation' }
    else {
      const field = overrides.fields?.[key]
      const reference = (field?.referenceCampaignId && inventory.campaigns.find((campaign) => campaign.id === field.referenceCampaignId && campaign.accountId === accountId)) || pickReference(accountId, name, hint)
      const issues: PlanIssue[] = []
      if (!reference) issues.push({ field: 'Campaña de referencia', message: `No hay una campaña${hint ? ` con destino ${DESTINATION_LABEL[hint]}` : ''} en la cuenta para copiar objetivo y estructura`, where: 'Elegí una referencia en este ítem' })
      const dailyBudget = field?.dailyBudget ?? (reference?.isCbo ? reference.dailyBudget : undefined)
      if (reference?.isCbo && !dailyBudget) issues.push({ field: 'Presupuesto de campaña', message: 'La referencia usa presupuesto de campaña y no tiene monto', where: 'Completá el presupuesto diario en este ítem' })
      plan = {
        ...base, mode: 'create', status: 'create', candidates: [], isCbo: Boolean(reference?.isCbo), dailyBudget,
        reference: reference ? { id: reference.id, name: reference.name, objective: reference.objective } : undefined,
        reason: decision === 'create' ? 'Confirmado: se crea una campaña nueva' : reference ? `No existe en ninguna cuenta del cliente: se crea copiando "${reference.name}"` : 'No existe en ninguna cuenta del cliente',
        issues, state: issues.length ? 'blocked' : 'ready',
      }
    }
    campaigns.set(key, plan)
    return plan
  }

  function ensureAdsets(row: Cells, campaign: PlanCampaign, hint?: string): PlanAdset[] {
    const adsetName = cell(row, 'adset_name')
    const existingAdsets = campaign.existingId ? adsetsOf(campaign.existingId) : []
    const options = existingAdsets.map(({ id, name, status }) => ({ id, name, status }))
    const register = (plan: PlanAdset) => {
      const current = adsets.get(plan.key)
      if (current) {
        current.rows.push(row.rowNumber)
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
        const match = existingAdsets.find((adset) => sameText(adset.name, adsetName))
        if (match) return [register(existingPlan(match, 'Conjunto encontrado por nombre exacto'))]
      } else {
        const choiceKey = `${campaign.key}::choice`
        const chosen = overrides.adsetChoice?.[choiceKey]
        if (chosen?.length) return chosen.map((id) => existingAdsets.find((adset) => adset.id === id)).filter((adset): adset is InventoryAdset => Boolean(adset)).map((adset) => register(existingPlan(adset, 'Conjunto elegido a mano')))
        const active = existingAdsets.filter((adset) => adset.status === 'ACTIVE')
        if (active.length === 1) return [register(existingPlan(active[0], 'La campaña tiene un solo conjunto activo'))]
        if (!active.length && existingAdsets.length === 1) return [register(existingPlan(existingAdsets[0], 'La campaña tiene un solo conjunto'))]
        if (existingAdsets.length > 1) {
          return [register({
            key: choiceKey, campaignKey: campaign.key, accountId: campaign.accountId, name: 'Elegir conjunto', mode: 'existing', existingIds: [], options, rows: [row.rowNumber],
            reason: `La campaña tiene ${active.length || existingAdsets.length} conjuntos${active.length ? ' activos' : ''}: elegí en cuál cargar`, state: 'needs_confirmation', issues: [],
          })]
        }
      }
    }

    const name = adsetName || campaign.name
    const key = `${campaign.key}::new::${normalizeText(name)}`
    const field = overrides.fields?.[key]
    const pool = campaign.mode === 'existing' ? existingAdsets : campaign.reference ? adsetsOf(campaign.reference.id) : []
    const reference = (field?.referenceAdsetId && inventory.adsets.find((adset) => adset.id === field.referenceAdsetId && adset.accountId === campaign.accountId))
      || [...pool].sort((a, b) => Number(b.destination === hint) - Number(a.destination === hint) || Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE'))[0]
    const issues: PlanIssue[] = []
    if (!reference) issues.push({ field: 'Conjunto de referencia', message: 'No hay un conjunto del que copiar segmentación, ubicaciones y optimización', where: 'Elegí una referencia en este ítem' })
    const dailyBudget = field?.dailyBudget ?? reference?.dailyBudget
    if (!campaign.isCbo && !dailyBudget) issues.push({ field: 'Presupuesto del conjunto', message: 'Falta el presupuesto diario', where: 'Completá el presupuesto en este ítem' })
    if (reference?.destination === 'WEBSITE' && reference.optimizationGoal === 'OFFSITE_CONVERSIONS' && !reference.hasPixel) issues.push({ field: 'Píxel', message: 'La referencia optimiza conversiones sin píxel', where: 'Elegí otra referencia' })
    return [register({
      key, campaignKey: campaign.key, accountId: campaign.accountId, name, mode: 'create', existingIds: [], options, rows: [row.rowNumber],
      reference: reference ? { id: reference.id, name: reference.name } : undefined, dailyBudget, pageId: field?.pageId ?? reference?.pageId, destination: reference?.destination,
      reason: reference ? `Se crea copiando la configuración de "${reference.name}"` : 'Se crea un conjunto nuevo', issues, state: issues.length ? 'blocked' : 'ready',
    })]
  }

  function piecesOf(row: Cells) {
    const columns = roles.get('creatives_link')
    const ids = [...new Set(columns ? columns.flatMap((index) => row.driveIds[index] ?? []) : row.driveIds.flat())]
    const files = [...new Map(ids.flatMap((id) => context.drive[id]?.files ?? []).map((file) => [file.id, file])).values()]
    const error = ids.map((id) => context.drive[id]?.error).find(Boolean)
    const groups = new Map<string, DriveFileRef[]>()
    for (const file of files.sort((a, b) => a.name.localeCompare(b.name))) groups.set(baseNameOf(file.name), [...(groups.get(baseNameOf(file.name)) ?? []), file])
    return { hasLink: ids.length > 0, error, groups }
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
    const adFormats = [...new Set(byName.map((ad) => ratioFromName(ad.name) ?? ratioFromName(ad.creativeName ?? '')).filter((value): value is NonNullable<typeof value> => Boolean(value)))]
    const match = { adId: byName[0].id, name: byName[0].name, thumbnail: byName[0].thumbnail, formats: adFormats, certain: false }
    return { comparison: adFormats.length && formats.some((format) => !adFormats.includes(format)) ? 'missing_formats' : 'unchanged', match }
  }

  for (const row of grid.rows) {
    const filteredOut = isFilteredOut(row)
    const account = resolveAccount(row)
    const rawAction = cell(row, 'action')
    const sheetAction: CanonicalAction | undefined = roles.has('action') ? (vocabulary[normalizeText(rawAction)] ?? (rawAction ? 'unknown' : undefined)) : undefined
    const manualAction = overrides.actionByRow?.[row.rowNumber]
    const planRow: PlanRow = {
      rowNumber: row.rowNumber, excluded: excluded.has(row.rowNumber), filteredOut, ...account,
      action: manualAction ?? sheetAction ?? 'create', actionSource: manualAction ? 'manual' : sheetAction ? 'sheet' : 'inferred', state: 'ready', issues: [],
    }
    rows.push(planRow)
    if (filteredOut || planRow.excluded) continue

    const campaignName = cell(row, 'campaign_name')
    if (!campaignName) planRow.issues.push({ field: 'Campaña', message: 'La fila no tiene nombre de campaña', where: `Completalo en el sheet (fila ${row.rowNumber})` })
    const { hasLink, error, groups } = piecesOf(row)
    if (!hasLink) planRow.issues.push({ field: 'Creativos', message: 'La fila no tiene link de Drive', where: `Fila ${row.rowNumber} del sheet` })
    else if (!groups.size) planRow.issues.push({ field: 'Creativos', message: error ?? 'La carpeta de Drive no tiene imágenes ni videos compatibles', where: 'Revisá el link y el acceso a Drive' })
    planRow.driveError = error
    if (planRow.action === 'unknown') planRow.issues.push({ field: 'Acción', message: `No entiendo la acción "${rawAction}"`, where: 'Elegí la acción en este ítem' })

    if (!planRow.accountId || !campaignName) {
      planRow.state = worst([planRow.accountStatus === 'account_unresolved' ? 'needs_confirmation' : 'ready', ...planRow.issues.map(() => 'blocked' as const)])
      continue
    }

    const instructions = cellsOf(row, 'instructions').join(' · ')
    const instruction: InstructionOverrides = instructions ? context.instructionOverrides[instructionsKey(instructions)] ?? {} : {}
    const hint = destinationHint([campaignName, ...cellsOf(row, 'attribute'), instructions].join(' '))
    const campaign = ensureCampaign(row, planRow.accountId, campaignName, hint)
    planRow.campaignKey = campaign.key
    if (campaign.mode === 'create' && campaign.status === 'create' && !manualAction && (planRow.action === 'replace' || planRow.action === 'add_formats')) {
      planRow.actionWarning = `La acción dice "${rawAction}" pero la campaña no existe`
      planRow.issues.push({ field: 'Acción', message: planRow.actionWarning, where: 'Elegí crear o excluir la fila' })
    }
    const targets = campaign.state === 'needs_confirmation' ? [] : ensureAdsets(row, campaign, hint)
    planRow.adsetKey = targets[0]?.key

    for (const adset of targets) {
      for (const [piece, files] of groups) {
        const pieceKey = `${row.rowNumber}:${normalizeText(piece)}:${adset.key}`
        const decision = overrides.pieceMatch?.[pieceKey]
        let { comparison, match } = compare(piece, files, adset)
        if (match && !match.certain && decision === 'reject') {
          comparison = 'new'
          match = undefined
        }
        const pendingMatch = Boolean(match && !match.certain && !decision)
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

        const baseName = instruction.adNameMode === 'today' ? context.today : instruction.adName || cell(row, 'ad_name') || piece
        const names = namesByAdset.get(adset.key) ?? new Map<string, number>()
        const used = (names.get(normalizeText(baseName)) ?? 0) + 1
        names.set(normalizeText(baseName), used)
        namesByAdset.set(adset.key, names)
        const name = used > 1 || (groups.size > 1 && instruction.adNameMode === 'today') ? `${baseName}_${used}` : baseName

        const issues: PlanIssue[] = []
        const pageId = adset.pageId ?? context.pageIds[0]
        if (badge !== 'Sin cambios' && !pageId) issues.push({ field: 'Página', message: 'No hay página de Facebook para el anuncio', where: 'Asigná la página del cliente en Meta Ads' })
        if (badge !== 'Sin cambios' && adset.destination !== 'WHATSAPP' && !/^https?:\/\//i.test(instruction.url || cell(row, 'url') || context.batchDefaults.url)) issues.push({ field: 'URL', message: 'Falta la URL de destino', where: 'Valores por defecto del lote o Contexto del cliente' })

        const why = effective === 'skip' ? (match ? `Ya existe "${match.name}" con esta pieza: sin cambios` : 'La acción del sheet no aplica a esta pieza')
          : effective === 'add_formats' ? `En Drive hay ${formats.filter((format) => !match?.formats.includes(format)).join(', ')} que el anuncio actual no tiene: se crea un anuncio nuevo`
          : effective === 'replace' ? (match ? `Creativo nuevo para "${match.name}": se crea un anuncio nuevo y el anterior queda como está` : 'Se crea un anuncio nuevo con los creativos de Drive')
          : adset.mode === 'create' ? 'Va dentro del conjunto nuevo' : 'La pieza no está en el conjunto: se crea un anuncio nuevo'

        ads.push({
          id: pieceKey, rowNumber: row.rowNumber, accountId: campaign.accountId, campaignKey: campaign.key, adsetKey: adset.key, piece, files, formats, comparison, match,
          action: effective, badge, name, primaryText, headline, aiCopy,
          cta: instruction.cta || cell(row, 'cta') || context.batchDefaults.cta, url: instruction.url || cell(row, 'url') || context.batchDefaults.url,
          reason: pendingMatch ? `Posible coincidencia por nombre con "${match!.name}": confirmá si es la misma pieza` : why,
          state: pendingMatch ? 'needs_confirmation' : issues.length ? 'blocked' : 'ready', issues,
          idempotencyKey: hashText([context.spreadsheetId, row.rowNumber, normalizeText(piece), adset.key, files.map((file) => `${file.id}@${file.modifiedTime ?? ''}`).join(',')].join('|')),
        })
      }
    }
    planRow.state = worst([
      planRow.accountStatus === 'account_unresolved' ? 'needs_confirmation' : 'ready',
      planRow.actionWarning || planRow.action === 'unknown' ? 'needs_confirmation' : 'ready',
      ...planRow.issues.filter((issue) => issue.field !== 'Acción').map(() => 'blocked' as const),
    ])
  }

  const included = rows.filter((row) => !row.excluded && !row.filteredOut)
  const acting = ads.filter((ad) => ad.badge !== 'Sin cambios')
  const campaignList = [...campaigns.values()]
  const adsetList = [...adsets.values()]
  return {
    rows, campaigns: campaignList, adsets: adsetList, ads,
    summary: {
      read: rows.length, processed: included.length, filtered: rows.filter((row) => row.filteredOut).length, excluded: rows.filter((row) => row.excluded).length,
      newCampaigns: campaignList.filter((item) => item.mode === 'create' && item.state !== 'needs_confirmation').length,
      newAdsets: adsetList.filter((item) => item.mode === 'create').length,
      newAds: acting.length, replace: acting.filter((ad) => ad.badge === 'Nuevo (reemplaza creativos)').length, addFormats: acting.filter((ad) => ad.badge === 'Nuevo (formatos faltantes)').length,
      unchanged: ads.length - acting.length,
    },
  }
}

export function planBlockers(plan: ResolvedPlan) {
  const rows = plan.rows.filter((row) => !row.excluded && !row.filteredOut)
  const acting = plan.ads.filter((ad) => ad.badge !== 'Sin cambios')
  const campaignKeys = new Set(acting.map((ad) => ad.campaignKey))
  const adsetKeys = new Set(acting.map((ad) => ad.adsetKey))
  const states = [
    ...rows.map((row) => row.state),
    ...plan.campaigns.filter((item) => campaignKeys.has(item.key) || item.state === 'needs_confirmation').map((item) => item.state),
    ...plan.adsets.filter((item) => adsetKeys.has(item.key) || item.state === 'needs_confirmation').map((item) => item.state),
    ...plan.ads.map((ad) => ad.state),
  ]
  return { blocked: states.filter((state) => state === 'blocked').length, needsConfirmation: states.filter((state) => state === 'needs_confirmation').length, actions: acting.length }
}
