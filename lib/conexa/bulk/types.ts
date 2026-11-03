import { z } from 'zod'
import type { SheetGrid } from '@/lib/bulk/types'

export const ROLES = [
  'account', 'campaign_name', 'adset_name', 'ad_name', 'action', 'status', 'creatives_link', 'budget',
  'start_date', 'end_date', 'primary_text', 'headline', 'description', 'cta', 'url', 'attribute', 'instructions', 'request_date', 'ignore',
] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  account: 'Cuenta publicitaria', campaign_name: 'Nombre de campaña', adset_name: 'Conjunto', ad_name: 'Nombre del anuncio',
  action: 'Acción', status: 'Estado', creatives_link: 'Link de creativos', budget: 'Inversión', start_date: 'Fecha inicio', end_date: 'Fecha fin',
  primary_text: 'Texto principal', headline: 'Título', description: 'Descripción', cta: 'CTA', url: 'URL destino',
  attribute: 'Atributo (contexto)', instructions: 'Instrucciones', request_date: 'Fecha de pedido', ignore: 'Ignorar',
}

export const CANONICAL_ACTIONS = ['create', 'replace', 'add_formats', 'skip', 'unknown'] as const
export type CanonicalAction = (typeof CANONICAL_ACTIONS)[number]

export const ACTION_LABELS: Record<CanonicalAction, string> = { create: 'Crear', replace: 'Reemplazar creativos', add_formats: 'Sumar formatos', skip: 'Sin cambios', unknown: 'Sin definir' }

export const sheetInterpretationSchema = z.object({
  columns: z.array(z.object({ header: z.string(), role: z.enum(ROLES), confidence: z.number().min(0).max(1), note: z.string().optional() })),
  actionVocabulary: z.record(z.enum(CANONICAL_ACTIONS)),
  // confirmed: done/error los eligió el equipo, así que valen aunque todavía no aparezcan en el sheet.
  statusVocabulary: z.object({ pending: z.array(z.string()), done: z.string().optional(), error: z.string().optional(), confirmed: z.boolean().optional() }),
  suggestedRowFilter: z.object({ column: z.string(), values: z.array(z.string()) }).optional(),
  // Aclaraciones del equipo sobre instrucciones, por hash del texto normalizado: se reutilizan en otros sheets del cliente.
  instructionNotes: z.record(z.object({ decision: z.enum(['apply', 'ignore', 'clarified']), clarification: z.string().optional() })).optional(),
  warnings: z.array(z.string()),
})
export type SheetInterpretation = z.infer<typeof sheetInterpretationSchema>

export type InterpretResponse = {
  interpretationId: string
  headersHash: string
  interpretation: SheetInterpretation
  reused: 'full' | 'partial' | 'none'
  grid: SheetGrid
  spreadsheetId: string
  persisted: boolean
}

// unlinked: the account isn't linked to the client in the app, but it holds campaigns from the sheet.
export type InventoryAccount = { id: string; name: string; unlinked?: boolean }
export type InventoryCampaign = { id: string; accountId: string; name: string; objective: string; status: string; dailyBudget?: number; isCbo: boolean }
export type InventoryAdset = { id: string; accountId: string; campaignId: string; name: string; status: string; destination: string; dailyBudget?: number; pageId?: string; optimizationGoal?: string; hasPixel: boolean; endTime?: string; positions?: string[]; whatsappNumber?: string }
export type InventoryAd = { id: string; accountId: string; adsetId: string; name: string; status?: string; createdTime?: string; leadFormId?: string; creativeId?: string; creativeName?: string; thumbnail?: string; primaryText: string; headline: string }
export type LeadFormInfo = { id: string; name?: string; status?: string; pageId?: string; pageName?: string; nameError?: string }
export type Inventory = {
  accounts: InventoryAccount[]; campaigns: InventoryCampaign[]; adsets: InventoryAdset[]; ads: InventoryAd[]; currency: Record<string, string>
  // Details of the forms used by the ads, and the active forms of each form-adset page (fallback when an adset has none).
  leadForms?: Record<string, LeadFormInfo>
  pageForms?: Record<string, LeadFormInfo[]>
  pageAccessErrors?: Record<string, string>
}

export type DriveFileRef = { id: string; name: string; mimeType: string; width: number; height: number; modifiedTime?: string }
export type CreativeSource = { adAccountId: string; adId: string; creativeId?: string; driveFileId: string; driveModifiedTime?: string; format: string }

export type InstructionStatus = 'applied' | 'no_effect' | 'unclear'
export type InstructionOverrides = {
  adName?: string; adNameMode?: 'today' | 'literal'; primaryText?: string; headline?: string; cta?: string; url?: string; notes?: string; placeInModelAdset?: boolean; reuseLeadForm?: boolean
  status?: InstructionStatus; meaning?: string; contradicts?: boolean
}
export type InstructionChip = { text: string; status: 'applied' | 'no_effect' | 'unclear' | 'ignored' | 'contradicts'; detail: string }

export type PlanContext = {
  planId: string
  clientId: string
  sheetUrl: string
  spreadsheetId: string
  sheetTitle: string
  grid: SheetGrid
  interpretation: SheetInterpretation
  rowFilter?: { column: string; values: string[] }
  inventory: Inventory
  drive: Record<string, { files: DriveFileRef[]; error?: string }>
  sources: CreativeSource[]
  aliases: Record<string, string>
  semanticMatches: Record<string, string[]>
  instructionOverrides: Record<string, InstructionOverrides>
  generatedCopy: Record<string, { primaryText: string; headline: string }>
  batchDefaults: { cta: string; url: string }
  pageIds: string[]
  today: string
  warnings: string[]
  clientContext?: string
  // Latest earlier batch that created each row, keyed by rowKey (sheet + row number).
  previousRows?: Record<string, { planId: string; contentHash: string; createdAt: string }>
}

export type PlanOverrides = {
  excludedRows?: number[]
  // Rows already created in an earlier batch start unchecked; these were checked again on purpose.
  includeCreatedRows?: number[]
  accountByRow?: Record<number, string>
  campaignDecision?: Record<string, 'use_existing' | 'create' | string>
  adsetChoice?: Record<string, string[]>
  pieceMatch?: Record<string, 'confirm' | 'reject'>
  actionByRow?: Record<number, CanonicalAction>
  fields?: Record<string, { dailyBudget?: number; referenceCampaignId?: string; referenceAdsetId?: string; pageId?: string }>
  answers?: Record<string, PlanAnswer>
}

// groups: un grupo de ids de archivo por anuncio; los archivos que no quedan en ningún grupo se excluyen.
export type PlanAnswer = { value?: string; values?: string[]; text?: string; groups?: string[][] }

export type FolderFilesPayload = { folderLabel: string; files: Array<{ id: string; name: string; format: string; kind: 'image' | 'video' }>; duplicated: string[] }

export const ANSWER_EXCLUDE = '__exclude'
export const ANSWER_CREATE = '__create'

export type PlacementCheck = { label: string; ok: boolean; detail: string }
export type PlacementAdsetOption = { id: string; name: string; status: string; destinationLabel: string; score: number; checks: PlacementCheck[] }
export type PlacementCampaignOption = { id: string; name: string; status: string; objective: string; score: number; adsets: PlacementAdsetOption[] }
export type PlacementPayload = {
  accountName: string
  modality?: string
  unit?: string
  maxScore: number
  matched: boolean
  campaigns: PlacementCampaignOption[]
  groupQuestionId: string
  groupRows: number[]
}

export type PlanQuestion = {
  id: string
  kind: 'choice' | 'multi' | 'text' | 'placement' | 'files'
  placement?: PlacementPayload
  folderFiles?: FolderFilesPayload
  field: string
  prompt: string
  why: string
  options: Array<{ value: string; label: string; hint?: string }>
  searchable: boolean
  allowFree: boolean
  freePlaceholder: string
  suggestion?: string
  target: 'row' | 'campaign' | 'adset' | 'ad'
  targetKey: string
  rowNumbers: number[]
  answered: boolean
  answer?: PlanAnswer
  answerLabel?: string
  note?: string
  reuse?: { kind: 'alias'; alias: string } | { kind: 'action'; value: string } | { kind: 'instruction'; key: string; text: string }
}

export type ItemState = 'ready' | 'needs_confirmation' | 'needs_answer' | 'blocked'
export type PieceComparison = 'new' | 'changed' | 'missing_formats' | 'unchanged'

export type PlanBadge = 'Crear campaña' | 'Usar existente' | 'Crear conjunto' | 'Crear anuncio' | 'Nuevo (reemplaza creativos)' | 'Nuevo (formatos faltantes)' | 'Sin cambios'

export type PlanIssue = { field: string; message: string; where: string }

export type PlanCampaign = {
  key: string
  accountId: string
  name: string
  mode: 'existing' | 'create'
  existingId?: string
  status: 'exists' | 'exists_other_account' | 'possible_match' | 'create' | 'not_found'
  candidates: Array<{ id: string; name: string; accountId: string }>
  /** Campaña tal como existe en Meta (nombre real, estado y cómo se encontró). */
  meta?: { id: string; name: string; status: string; match: 'exacta' | 'normalizada' | 'elegida' }
  reference?: { id: string; name: string; objective: string }
  dailyBudget?: number
  isCbo: boolean
  rows: number[]
  reason: string
  state: ItemState
  issues: PlanIssue[]
}

export type PlanAdset = {
  key: string
  campaignKey: string
  accountId: string
  name: string
  mode: 'existing' | 'create'
  existingIds: string[]
  options: Array<{ id: string; name: string; status: string }>
  reference?: { id: string; name: string }
  dailyBudget?: number
  pageId?: string
  destination?: string
  rows: number[]
  reason: string
  state: ItemState
  issues: PlanIssue[]
}

export type PlanAd = {
  id: string
  rowNumber: number
  accountId: string
  campaignKey: string
  adsetKey: string
  piece: string
  files: DriveFileRef[]
  formats: string[]
  slots: Record<string, Array<'feed' | 'vertical' | 'other'>>
  placementWarnings: string[]
  ignoredFiles: Array<{ name: string; reason: string }>
  comparison: PieceComparison
  match?: { adId: string; name: string; thumbnail?: string; formats: string[]; certain: boolean }
  action: CanonicalAction
  badge: PlanBadge
  name: string
  primaryText: string
  headline: string
  aiCopy: boolean
  cta: string
  url: string
  leadFormId?: string
  leadFormNote?: string
  reason: string
  state: ItemState
  issues: PlanIssue[]
  idempotencyKey: string
}

export type PlanRow = {
  rowNumber: number
  excluded: boolean
  previous?: { kind: 'created' | 'modified'; date: string; planId: string }
  filteredOut: boolean
  ignored: boolean
  accountId?: string
  accountStatus: 'resolved' | 'account_unresolved'
  accountReason: string
  accountCandidates: InventoryAccount[]
  action: CanonicalAction
  actionSource: 'sheet' | 'inferred' | 'manual'
  actionWarning?: string
  campaignKey?: string
  adsetKey?: string
  driveError?: string
  instructions?: InstructionChip[]
  state: ItemState
  issues: PlanIssue[]
}

export type ResolvedPlan = {
  rows: PlanRow[]
  campaigns: PlanCampaign[]
  adsets: PlanAdset[]
  ads: PlanAd[]
  questions: PlanQuestion[]
  summary: { read: number; processed: number; pendingQuestions: number; filtered: number; excluded: number; ignored: number; newCampaigns: number; newAdsets: number; newAds: number; replace: number; addFormats: number; unchanged: number }
}

export type ExecuteAdRequest = {
  clientId: string
  planId: string
  confirmed: true
  item: {
    id: string
    rowNumber: number
    idempotencyKey: string
    // Set by the server: sheet + row number, and the hash of the row content, to spot re-imported rows.
    rowKey?: string
    contentHash?: string
    accountId: string
    answers?: Record<string, PlanAnswer>
    campaign: { mode: 'existing'; id: string } | { mode: 'create'; key: string; name: string; referenceId: string; dailyBudget?: number }
    adset: { mode: 'existing'; id: string } | { mode: 'create'; key: string; name: string; referenceId: string; dailyBudget?: number }
    ad: { name: string; primaryText: string; headline: string; cta: string; link: string; pageId: string; leadFormId?: string; assets: Array<{ url: string; kind: 'image' | 'video'; name: string; slots: Array<'feed' | 'vertical' | 'other'> }>; driveFileIds: Array<{ id: string; modifiedTime?: string; format: string }> }
  }
}

export type ExecuteAdResult = { itemId: string; ok: true; campaignId: string; adsetId: string; adId: string; creativeId: string; accountId: string; reused: { campaign: boolean; adset: boolean; ad: boolean } } | { itemId: string; ok: false; error: string; step?: string }
