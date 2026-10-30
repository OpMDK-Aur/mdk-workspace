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
  statusVocabulary: z.object({ pending: z.array(z.string()), done: z.string().optional(), error: z.string().optional() }),
  suggestedRowFilter: z.object({ column: z.string(), values: z.array(z.string()) }).optional(),
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

export type InventoryAccount = { id: string; name: string }
export type InventoryCampaign = { id: string; accountId: string; name: string; objective: string; status: string; dailyBudget?: number; isCbo: boolean }
export type InventoryAdset = { id: string; accountId: string; campaignId: string; name: string; status: string; destination: string; dailyBudget?: number; pageId?: string; optimizationGoal?: string; hasPixel: boolean }
export type InventoryAd = { id: string; accountId: string; adsetId: string; name: string; creativeId?: string; creativeName?: string; thumbnail?: string; primaryText: string; headline: string }
export type Inventory = { accounts: InventoryAccount[]; campaigns: InventoryCampaign[]; adsets: InventoryAdset[]; ads: InventoryAd[]; currency: Record<string, string> }

export type DriveFileRef = { id: string; name: string; mimeType: string; width: number; height: number; modifiedTime?: string }
export type CreativeSource = { adAccountId: string; adId: string; creativeId?: string; driveFileId: string; driveModifiedTime?: string; format: string }

export type InstructionOverrides = { adName?: string; adNameMode?: 'today' | 'literal'; primaryText?: string; headline?: string; cta?: string; url?: string; notes?: string }

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
}

export type PlanOverrides = {
  excludedRows?: number[]
  accountByRow?: Record<number, string>
  campaignDecision?: Record<string, 'use_existing' | 'create' | string>
  adsetChoice?: Record<string, string[]>
  pieceMatch?: Record<string, 'confirm' | 'reject'>
  actionByRow?: Record<number, CanonicalAction>
  fields?: Record<string, { dailyBudget?: number; referenceCampaignId?: string; referenceAdsetId?: string; pageId?: string }>
}

export type ItemState = 'ready' | 'needs_confirmation' | 'blocked'
export type PieceComparison = 'new' | 'changed' | 'missing_formats' | 'unchanged'

export type PlanBadge = 'Crear campaña' | 'Usar existente' | 'Crear conjunto' | 'Crear anuncio' | 'Nuevo (reemplaza creativos)' | 'Nuevo (formatos faltantes)' | 'Sin cambios'

export type PlanIssue = { field: string; message: string; where: string }

export type PlanCampaign = {
  key: string
  accountId: string
  name: string
  mode: 'existing' | 'create'
  existingId?: string
  status: 'exists' | 'exists_other_account' | 'possible_match' | 'create'
  candidates: Array<{ id: string; name: string; accountId: string }>
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
  reason: string
  state: ItemState
  issues: PlanIssue[]
  idempotencyKey: string
}

export type PlanRow = {
  rowNumber: number
  excluded: boolean
  filteredOut: boolean
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
  state: ItemState
  issues: PlanIssue[]
}

export type ResolvedPlan = {
  rows: PlanRow[]
  campaigns: PlanCampaign[]
  adsets: PlanAdset[]
  ads: PlanAd[]
  summary: { read: number; processed: number; filtered: number; excluded: number; newCampaigns: number; newAdsets: number; newAds: number; replace: number; addFormats: number; unchanged: number }
}

export type ExecuteAdRequest = {
  clientId: string
  planId: string
  confirmed: true
  item: {
    id: string
    rowNumber: number
    idempotencyKey: string
    accountId: string
    campaign: { mode: 'existing'; id: string } | { mode: 'create'; key: string; name: string; referenceId: string; dailyBudget?: number }
    adset: { mode: 'existing'; id: string } | { mode: 'create'; key: string; name: string; referenceId: string; dailyBudget?: number }
    ad: { name: string; primaryText: string; headline: string; cta: string; link: string; pageId: string; asset: { url: string; kind: 'image' | 'video'; name: string }; driveFileIds: Array<{ id: string; modifiedTime?: string; format: string }> }
  }
}

export type ExecuteAdResult = { itemId: string; ok: true; campaignId: string; adsetId: string; adId: string; creativeId: string; accountId: string; reused: { campaign: boolean; adset: boolean; ad: boolean } } | { itemId: string; ok: false; error: string; step?: string }
