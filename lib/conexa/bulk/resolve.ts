import { baseNameOf, ratioFromDimensions, ratioFromName } from '@/lib/bulk/group-assets'
import {
  ACTION_LABELS, ANSWER_CREATE, ANSWER_EXCLUDE, CANONICAL_ACTIONS,
  type CanonicalAction, type DriveFileRef, type InstructionOverrides, type InventoryAccount, type InventoryAdset, type InventoryCampaign, type ItemState, type PieceComparison, type PlanAd, type PlanAdset,
  type PlanAnswer, type PlanBadge, type PlanCampaign, type PlanContext, type PlanIssue, type PlanOverrides, type PlanQuestion, type PlanRow, type ResolvedPlan, type Role,
} from './types'
import { containsText, hashText, normalizeText, sameText, tokenOverlap } from './text'

type Cells = { rowNumber: number; cells: string[]; driveIds: string[][] }
type Resolved = { value?: string; values?: string[]; text?: string; label?: string; note?: string }
type QuestionInput = Omit<PlanQuestion, 'rowNumbers' | 'answered' | 'answer' | 'answerLabel' | 'note' | 'searchable' | 'allowFree' | 'freePlaceholder'> & Partial<Pick<PlanQuestion, 'searchable' | 'allowFree' | 'freePlaceholder'>>

export const accountLabel = (accounts: InventoryAccount[], id?: string) => accounts.find((account) => account.id === id)?.name ?? id ?? 'Sin cuenta'
export const ratioLabel = (file: DriveFileRef) => ratioFromName(file.name) ?? ratioFromDimensions(file.width, file.height)
export const instructionsKey = (text: string) => hashText(normalizeText(text))
export const copyKey = (rowNumber: number, piece: string) => `${rowNumber}:${normalizeText(piece)}`
export const campaignMatchKey = (accountId: string, name: string) => `${accountId}::${normalizeText(name)}`

const RANK: ItemState[] = ['ready', 'needs_confirmation', 'needs_answer', 'blocked']
const worst = (states: ItemState[]): ItemState => states.reduce<ItemState>((acc, state) => (RANK.indexOf(state) > RANK.indexOf(acc) ? state : acc), 'ready')
const excludeOption = (rows = 1) => ({ value: ANSWER_EXCLUDE, label: rows > 1 ? 'Excluir las filas' : 'Excluir fila' })
const SPECIAL = new Set([ANSWER_EXCLUDE, ANSWER_CREATE])

function resolveAnswer(question: Pick<PlanQuestion, 'kind' | 'options'>, answer?: PlanAnswer): Resolved {
  if (!answer) return {}
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
  const answers = overrides.answers ?? {}
  const accounts = inventory.accounts
  const campaignsIn = (accountId: string) => inventory.campaigns.filter((campaign) => campaign.accountId === accountId)
  const adsetsOf = (campaignId: string) => inventory.adsets.filter((adset) => adset.campaignId === campaignId)
  const batchAdsetNames = grid.rows.map((row) => cell(row, 'adset_name')).filter(Boolean)

  const campaigns = new Map<string, PlanCampaign>()
  const adsets = new Map<string, PlanAdset>()
  const rows: PlanRow[] = []
  const ads: PlanAd[] = []
  const namesByAdset = new Map<string, Map<string, number>>()
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
      if (scores.length) return unresolved(`Más de una cuenta tiene campañas de "${attributes.join(' · ')}"`, scores.map((item) => item.account))
    }
    return unresolved('No hay columna de cuenta y no pude inferirla', [])
  }

  function pickReference(accountId: string, name: string, hint?: string) {
    const options = campaignsIn(accountId).filter((campaign) => adsetsOf(campaign.id).length)
    const withDestination = hint ? options.filter((campaign) => adsetsOf(campaign.id).some((adset) => adset.destination === hint)) : options
    return [...(withDestination.length ? withDestination : hint ? [] : options)]
      .sort((a, b) => tokenOverlap(name, b.name) - tokenOverlap(name, a.name) || Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE'))[0]
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
      dailyBudget: campaign.dailyBudget, rows: [row.rowNumber], reason, state: 'ready', issues: [],
    }
    campaigns.set(key, plan)
    return plan
  }

  function ensureCampaign(row: Cells, accountId: string, name: string, hint?: string): PlanCampaign {
    const key = campaignMatchKey(accountId, name)
    const existing = campaigns.get(key)
    if (existing) {
      existing.rows.push(row.rowNumber)
      addRowToTarget(key, row.rowNumber)
      return existing
    }
    const local = campaignsIn(accountId).find((campaign) => sameText(campaign.name, name))
    const elsewhere = inventory.campaigns.filter((campaign) => campaign.accountId !== accountId && sameText(campaign.name, name))
    const semantic = (context.semanticMatches[key] ?? []).map((id) => inventory.campaigns.find((campaign) => campaign.id === id)).filter((item): item is InventoryCampaign => Boolean(item))
    const base = { key, accountId, name, rows: [row.rowNumber], issues: [] as PlanIssue[] }
    if (local) {
      const plan: PlanCampaign = { ...base, mode: 'existing', existingId: local.id, status: 'exists', candidates: [], isCbo: local.isCbo, dailyBudget: local.dailyBudget, reason: `Campaña encontrada por nombre exacto en ${accountLabel(accounts, accountId)}`, state: 'ready' }
      campaigns.set(key, plan)
      return plan
    }

    const ambiguous = [...elsewhere, ...semantic.filter((item) => !elsewhere.some((other) => other.id === item.id))]
    let decision: string | undefined
    if (ambiguous.length) {
      const legacy = overrides.campaignDecision?.[key]
      const legacyAnswer = legacy ? { value: legacy === 'create' ? ANSWER_CREATE : legacy.startsWith('use:') ? legacy : `use:${legacy}` } : undefined
      decision = ask({
        id: `campaign:${key}`, kind: 'choice', field: 'Campaña',
        prompt: `No encontré "${name}" en ${accountLabel(accounts, accountId)}. ¿Uso una existente o la creo?`,
        why: elsewhere.length ? `Existe una campaña con ese nombre en ${elsewhere.map((item) => accountLabel(accounts, item.accountId)).join(', ')}` : `Hay campañas con nombre parecido: ${semantic.map((item) => `"${item.name}"`).join(', ')}`,
        options: [
          ...ambiguous.map((item) => ({ value: `use:${item.id}`, label: `Usar "${item.name}"`, hint: accountLabel(accounts, item.accountId) })),
          { value: ANSWER_CREATE, label: `Crear "${name}" nueva`, hint: accountLabel(accounts, accountId) },
          excludeOption(),
        ],
        target: 'campaign', targetKey: key, freePlaceholder: 'Escribí el nombre de otra campaña…',
      }, row.rowNumber, legacyAnswer)?.value
    }
    const used = decision?.startsWith('use:') ? inventory.campaigns.find((campaign) => campaign.id === decision!.slice(4)) : undefined

    let plan: PlanCampaign
    if (used) plan = { ...base, accountId: used.accountId, mode: 'existing', existingId: used.id, status: elsewhere.some((item) => item.id === used.id) ? 'exists_other_account' : 'possible_match', candidates: [], isCbo: used.isCbo, dailyBudget: used.dailyBudget, reason: `Respondiste: se usa "${used.name}" en ${accountLabel(accounts, used.accountId)}`, state: 'ready' }
    else if (ambiguous.length && decision !== ANSWER_CREATE) plan = { ...base, mode: 'create', status: elsewhere.length ? 'exists_other_account' : 'possible_match', candidates: ambiguous.map(({ id, name: candidate, accountId: owner }) => ({ id, name: candidate, accountId: owner })), isCbo: false, reason: 'Esperando tu respuesta', state: 'needs_answer' }
    else {
      const field = overrides.fields?.[key]
      const referencePool = campaignsIn(accountId).filter((campaign) => adsetsOf(campaign.id).length)
      let reference = (field?.referenceCampaignId && inventory.campaigns.find((campaign) => campaign.id === field.referenceCampaignId && campaign.accountId === accountId)) || pickReference(accountId, name, hint)
      const issues: PlanIssue[] = []
      let state: ItemState = 'ready'
      if (!reference && referencePool.length) {
        const answer = ask({
          id: `campaign-ref:${key}`, kind: 'choice', field: 'Campaña de referencia',
          prompt: `¿De qué campaña copio objetivo y estructura para crear "${name}"?`,
          why: `No encontré una campaña${hint ? ` con destino ${DESTINATION_LABEL[hint]}` : ''} parecida en la cuenta`,
          options: [...referencePool.map((item) => ({ value: item.id, label: item.name, hint: item.objective })), excludeOption()],
          target: 'campaign', targetKey: key, freePlaceholder: 'Buscar campaña por nombre…',
        }, row.rowNumber)
        reference = referencePool.find((item) => item.id === answer?.value)
        if (!reference) state = 'needs_answer'
      } else if (!reference) issues.push({ field: 'Campaña de referencia', message: 'La cuenta no tiene campañas con conjuntos para copiar objetivo y estructura', where: 'Creá una campaña base en Meta o excluí la fila' })
      const dailyBudget = field?.dailyBudget ?? (reference?.isCbo ? reference.dailyBudget : undefined)
      if (reference?.isCbo && !dailyBudget) issues.push({ field: 'Presupuesto de campaña', message: 'La referencia usa presupuesto de campaña y no tiene monto', where: 'Completá el presupuesto diario en este ítem' })
      plan = {
        ...base, mode: 'create', status: 'create', candidates: [], isCbo: Boolean(reference?.isCbo), dailyBudget,
        reference: reference ? { id: reference.id, name: reference.name, objective: reference.objective } : undefined,
        reason: decision === ANSWER_CREATE ? 'Respondiste: se crea una campaña nueva' : reference ? `No existe en ninguna cuenta del cliente: se crea copiando "${reference.name}"` : 'No existe en ninguna cuenta del cliente',
        issues, state: issues.length ? 'blocked' : state,
      }
    }
    campaigns.set(key, plan)
    return plan
  }

  function ensureAdsets(row: Cells, campaign: PlanCampaign, hint?: string): PlanAdset[] {
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
        const match = existingAdsets.find((adset) => sameText(adset.name, adsetName))
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
      } else if (existingAdsets.length) {
        const active = existingAdsets.filter((adset) => adset.status === 'ACTIVE')
        if (active.length === 1) return [register(existingPlan(active[0], 'La campaña tiene un solo conjunto activo'))]
        if (!active.length && existingAdsets.length === 1) return [register(existingPlan(existingAdsets[0], 'La campaña tiene un solo conjunto'))]
        const legacy = overrides.adsetChoice?.[`${campaign.key}::choice`]
        const answer = ask({
          id: `adset-choice:${campaign.key}`, kind: 'multi', field: 'Conjunto',
          prompt: `La fila no indica conjunto y "${campaign.name}" tiene varios. ¿En cuáles cargo los anuncios?`,
          why: `Hay ${active.length || existingAdsets.length} conjuntos${active.length ? ' activos' : ''} y no hay forma de saber cuál corresponde`,
          options: adsetOptions, target: 'campaign', targetKey: campaign.key, allowFree: false,
        }, row.rowNumber, legacy?.length ? { values: legacy } : undefined)
        if (!answer?.values?.length) return []
        return answer.values.map((id) => existingAdsets.find((adset) => adset.id === id)).filter((adset): adset is InventoryAdset => Boolean(adset)).map((adset) => register(existingPlan(adset, 'Respondiste: conjunto elegido')))
      }
    }

    let name = adsetName
    if (!name) {
      const answer = ask({
        id: `adset-name:${campaign.key}`, kind: 'text', field: 'Nombre del conjunto',
        prompt: `La fila no indica conjunto. ¿Qué nombre uso para el conjunto nuevo en "${campaign.name}"?`,
        why: 'No hay columna o valor de conjunto en la fila',
        options: [], suggestion: suggestName(batchAdsetNames, cellsOf(row, 'attribute'), campaign.name),
        target: 'campaign', targetKey: campaign.key, freePlaceholder: 'Nombre del conjunto',
      }, row.rowNumber)
      if (!answer?.text) return []
      name = answer.text
    }

    const key = `${campaign.key}::new::${normalizeText(name)}`
    const field = overrides.fields?.[key]
    const pool = campaign.mode === 'existing' ? existingAdsets : campaign.reference ? adsetsOf(campaign.reference.id) : []
    let reference = (field?.referenceAdsetId && inventory.adsets.find((adset) => adset.id === field.referenceAdsetId && adset.accountId === campaign.accountId))
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
  function placeWithoutCampaign(row: Cells, accountId: string): { campaign: PlanCampaign; targets: PlanAdset[] } | { issue: PlanIssue } | undefined {
    const adsetName = cell(row, 'adset_name')
    const matches = adsetName ? inventory.adsets.filter((adset) => adset.accountId === accountId && sameText(adset.name, adsetName)) : []
    const campaignOf = (adset: InventoryAdset) => inventory.campaigns.find((campaign) => campaign.id === adset.campaignId)
    const useExisting = (adset: InventoryAdset, reason: string) => {
      const owner = campaignOf(adset)
      if (!owner) return undefined
      const campaign = existingCampaign(row, owner, `Campaña del conjunto "${adset.name}"`)
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

    return {
      issue: {
        field: 'Campaña',
        message: adsetName ? `La fila no trae campaña y no existe el conjunto "${adsetName}" en la cuenta` : 'La fila no trae campaña ni conjunto',
        where: `Completá la campaña en la fila ${row.rowNumber} del sheet o excluí la fila`,
      },
    }
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
    const active = !filteredOut && !excluded.has(row.rowNumber)
    const account = resolveAccount(row, active)
    const rawAction = cell(row, 'action')
    const sheetAction: CanonicalAction | undefined = roles.has('action') ? (vocabulary[normalizeText(rawAction)] ?? (rawAction ? 'unknown' : undefined)) : undefined
    const manualAction = overrides.actionByRow?.[row.rowNumber]
    const planRow: PlanRow = {
      rowNumber: row.rowNumber, excluded: excluded.has(row.rowNumber), filteredOut, ...account,
      action: manualAction ?? sheetAction ?? 'create', actionSource: manualAction ? 'manual' : sheetAction ? 'sheet' : 'inferred', state: 'ready', issues: [],
    }
    rows.push(planRow)
    if (!active) continue

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
    const { hasLink, error, groups } = piecesOf(row)
    if (!hasLink) planRow.issues.push({ field: 'Creativos', message: 'La fila no tiene link de Drive', where: `Fila ${row.rowNumber} del sheet` })
    else if (!groups.size) planRow.issues.push({ field: 'Creativos', message: error ?? 'La carpeta de Drive no tiene imágenes ni videos compatibles', where: 'Revisá el link y el acceso a Drive' })
    planRow.driveError = error
    planRow.state = worst(planRow.issues.map(() => 'blocked' as const))
    if (!planRow.accountId) continue

    const instructions = cellsOf(row, 'instructions').join(' · ')
    const instruction: InstructionOverrides = instructions ? context.instructionOverrides[instructionsKey(instructions)] ?? {} : {}
    const hint = destinationHint([campaignName, ...cellsOf(row, 'attribute'), instructions].join(' '))

    let campaign: PlanCampaign
    let targets: PlanAdset[]
    if (campaignName) {
      campaign = ensureCampaign(row, planRow.accountId, campaignName, hint)
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
      targets = campaign.state === 'needs_answer' ? [] : ensureAdsets(row, campaign, hint)
    } else {
      const placed = placeWithoutCampaign(row, planRow.accountId)
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
      for (const [piece, files] of groups) {
        const pieceKey = `${row.rowNumber}:${normalizeText(piece)}:${adset.key}`
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
          reason: pendingMatch ? 'Esperando tu respuesta sobre la coincidencia' : why,
          state: issues.length ? 'blocked' : 'ready', issues,
          idempotencyKey: hashText([context.spreadsheetId, row.rowNumber, normalizeText(piece), adset.key, files.map((file) => `${file.id}@${file.modifiedTime ?? ''}`).join(',')].join('|')),
        })
      }
    }
  }

  const questionList = [...questions.values()]
  const pendingList = questionList.filter((question) => !question.answered)
  const rowByNumber = new Map(rows.map((row) => [row.rowNumber, row]))
  for (const question of pendingList) {
    for (const rowNumber of question.rowNumbers) {
      const row = rowByNumber.get(rowNumber)
      if (row) row.state = worst([row.state, 'needs_answer'])
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

  const included = rows.filter((row) => !row.excluded && !row.filteredOut)
  const acting = ads.filter((ad) => ad.badge !== 'Sin cambios')
  const campaignList = [...campaigns.values()]
  const adsetList = [...adsets.values()]
  return {
    rows, campaigns: campaignList, adsets: adsetList, ads, questions: questionList,
    summary: {
      read: rows.length, processed: included.length, pendingQuestions: pendingList.length, filtered: rows.filter((row) => row.filteredOut).length, excluded: rows.filter((row) => row.excluded).length,
      newCampaigns: campaignList.filter((item) => item.mode === 'create' && item.state !== 'needs_answer').length,
      newAdsets: adsetList.filter((item) => item.mode === 'create').length,
      newAds: acting.length, replace: acting.filter((ad) => ad.badge === 'Nuevo (reemplaza creativos)').length, addFormats: acting.filter((ad) => ad.badge === 'Nuevo (formatos faltantes)').length,
      unchanged: ads.length - acting.length,
    },
  }
}

// Preguntas sin responder que afectan filas incluidas: mientras haya alguna, no se avanza ni se crea nada.
export const pendingQuestions = (plan: ResolvedPlan) => {
  const included = new Set(plan.rows.filter((row) => !row.excluded && !row.filteredOut).map((row) => row.rowNumber))
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
  const rows = plan.rows.filter((row) => !row.excluded && !row.filteredOut)
  const acting = plan.ads.filter((ad) => ad.badge !== 'Sin cambios')
  const campaignKeys = new Set(acting.map((ad) => ad.campaignKey))
  const adsetKeys = new Set(acting.map((ad) => ad.adsetKey))
  const states = [
    ...rows.map((row) => row.state),
    ...plan.campaigns.filter((item) => campaignKeys.has(item.key) || item.state === 'needs_answer').map((item) => item.state),
    ...plan.adsets.filter((item) => adsetKeys.has(item.key) || item.state === 'needs_answer').map((item) => item.state),
    ...plan.ads.map((ad) => ad.state),
  ]
  return {
    blocked: states.filter((state) => state === 'blocked').length,
    needsConfirmation: states.filter((state) => state === 'needs_confirmation').length,
    needsAnswer: pendingQuestions(plan).length,
    actions: acting.length,
  }
}
