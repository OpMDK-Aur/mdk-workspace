'use client'

import { create } from 'zustand'
import { groupAssets, mergeRows, newId, revokeAssetUrls } from './group-assets'
import type { PlanContext, PlanOverrides } from '@/lib/conexa/bulk/types'
import type { BulkAsset, BulkDefaults, BulkRow, CreativeSuggestion, LibraryAd, NewDestination, PublishInitialStatus, SheetImportEntry } from './types'

// 'plan' solo existe cuando la carga arrancó con "Importar desde Google Sheet".
export type BulkStep = 1 | 'plan' | 2 | 3
export type PublishPhase = 'idle' | 'publishing' | 'finished'
export type SheetPlanState = { context: PlanContext; overrides: PlanOverrides }

type BulkState = {
  clientId: string | null
  step: BulkStep
  rows: BulkRow[]
  selected: string[]
  defaults: BulkDefaults
  initialStatus: PublishInitialStatus
  publishPhase: PublishPhase
  publishProgress: number
  briefsSent: string[]
  destinations: NewDestination[]
  link: string
  sheetPlan: SheetPlanState | null
  startSheetPlan: (context: PlanContext) => void
  setPlanOverrides: (overrides: PlanOverrides) => void
  setPlanRows: (rows: BulkRow[]) => void
  exitSheetPlan: () => void
  addDestination: (destination: NewDestination) => void
  updateDestination: (id: string, patch: Partial<NewDestination>) => void
  removeDestination: (id: string) => void
  setLink: (link: string) => void
  setClient: (clientId: string, defaults: BulkDefaults) => void
  setStep: (step: BulkStep) => void
  setDefaults: (defaults: Partial<BulkDefaults>) => void
  addAssets: (assets: BulkAsset[]) => void
  addSuggestion: (suggestion: CreativeSuggestion) => void
  addLibraryAds: (ads: LibraryAd[]) => void
  addSheetRows: (entries: SheetImportEntry[]) => void
  updateRow: (id: string, patch: Partial<BulkRow>) => void
  updateRows: (ids: string[], patch: Partial<BulkRow>) => void
  removeRows: (ids: string[]) => void
  toggleSelected: (id: string) => void
  setSelected: (ids: string[]) => void
  setInitialStatus: (status: PublishInitialStatus) => void
  setPublishPhase: (phase: PublishPhase, progress?: number) => void
  markBriefSent: (id: string) => void
  reset: () => void
}

const initial = { step: 1 as BulkStep, rows: [], selected: [], initialStatus: 'PAUSED' as PublishInitialStatus, publishPhase: 'idle' as PublishPhase, publishProgress: 0, destinations: [] as NewDestination[], link: '', sheetPlan: null as SheetPlanState | null }

export const useBulkStore = create<BulkState>((set, get) => ({
  clientId: null,
  defaults: { adsetId: '', cta: 'Más información' },
  briefsSent: [],
  ...initial,
  setClient: (clientId, defaults) => {
    if (get().clientId === clientId) return
    for (const row of get().rows) revokeAssetUrls(row.assets)
    set({ clientId, defaults, briefsSent: [], ...initial })
  },
  addDestination: (destination) => set((state) => ({ destinations: [...state.destinations, destination] })),
  updateDestination: (id, patch) => set((state) => ({ destinations: state.destinations.map((item) => item.id === id ? { ...item, ...patch } : item) })),
  removeDestination: (id) => set((state) => ({
    destinations: state.destinations.filter((item) => item.id !== id),
    rows: state.rows.map((row) => row.adsetId === id ? { ...row, adsetId: '' } : row),
    defaults: state.defaults.adsetId === id ? { ...state.defaults, adsetId: '' } : state.defaults,
  })),
  setLink: (link) => set({ link }),
  startSheetPlan: (context) => {
    for (const row of get().rows) revokeAssetUrls(row.assets)
    set({ sheetPlan: { context, overrides: {} }, rows: [], selected: [], publishPhase: 'idle', publishProgress: 0, step: 'plan' })
  },
  setPlanOverrides: (overrides) => set((state) => (state.sheetPlan ? { sheetPlan: { ...state.sheetPlan, overrides } } : state)),
  setPlanRows: (rows) => set({ rows, selected: [], step: 2 }),
  exitSheetPlan: () => {
    for (const row of get().rows) revokeAssetUrls(row.assets)
    set({ sheetPlan: null, rows: [], selected: [], step: 1 })
  },
  setStep: (step) => set({ step }),
  setDefaults: (defaults) => set((state) => ({ defaults: { ...state.defaults, ...defaults } })),
  addAssets: (assets) => set((state) => ({ rows: mergeRows(state.rows, groupAssets(assets, state.defaults)), step: 2 })),
  addSuggestion: (suggestion) => set((state) => {
    if (state.rows.some((row) => row.fromSuggestion === suggestion.id)) return state
    const row: BulkRow = {
      id: newId('row'),
      baseName: suggestion.title.toLowerCase(),
      assets: suggestion.ratios.map((ratio) => ({ id: newId('asset'), name: `${suggestion.id}_${ratio}`, kind: suggestion.format.startsWith('Video') ? 'video' : 'image', ratio, pending: true })),
      adsetId: state.defaults.adsetId,
      cta: state.defaults.cta,
      primaryText: suggestion.copy,
      headline: suggestion.headline,
      aiGenerated: true,
      fromSuggestion: suggestion.id,
      status: 'idle',
    }
    return { rows: [...state.rows, row] }
  }),
  addLibraryAds: (ads) => set((state) => {
    const used = new Set(state.rows.flatMap((row) => row.assets.map((asset) => asset.sourceAdId).filter(Boolean)))
    const rows: BulkRow[] = ads.filter((ad) => !used.has(ad.id)).map((ad) => ({
      id: newId('row'),
      baseName: ad.name,
      assets: [{ id: newId('asset'), name: ad.name, kind: ad.kind, ratio: ad.kind === 'video' ? '9:16' : '1:1', sourceAdId: ad.id, ...(ad.thumbnail && { url: ad.thumbnail, kind: 'image' as const }) }],
      adsetId: state.defaults.adsetId,
      cta: state.defaults.cta,
      primaryText: ad.primaryText,
      headline: ad.headline,
      status: 'idle',
    }))
    return { rows: [...state.rows, ...rows], step: 2 }
  }),
  addSheetRows: (entries) => set((state) => ({
    rows: [...state.rows, ...entries.map((entry): BulkRow => ({
      id: newId('row'),
      baseName: entry.name,
      assets: entry.assets,
      adsetId: entry.adsetId || state.defaults.adsetId,
      cta: entry.cta ?? state.defaults.cta,
      primaryText: entry.primaryText,
      headline: entry.headline,
      status: 'idle',
    }))],
    step: 2,
  })),
  updateRow: (id, patch) => set((state) => ({ rows: state.rows.map((row) => row.id === id ? { ...row, ...patch } : row) })),
  updateRows: (ids, patch) => set((state) => ({ rows: state.rows.map((row) => ids.includes(row.id) ? { ...row, ...patch } : row) })),
  removeRows: (ids) => set((state) => {
    for (const row of state.rows) if (ids.includes(row.id)) revokeAssetUrls(row.assets)
    return { rows: state.rows.filter((row) => !ids.includes(row.id)), selected: state.selected.filter((id) => !ids.includes(id)) }
  }),
  toggleSelected: (id) => set((state) => ({ selected: state.selected.includes(id) ? state.selected.filter((item) => item !== id) : [...state.selected, id] })),
  setSelected: (selected) => set({ selected }),
  setInitialStatus: (initialStatus) => set({ initialStatus }),
  setPublishPhase: (publishPhase, publishProgress = get().publishProgress) => set({ publishPhase, publishProgress }),
  markBriefSent: (id) => set((state) => ({ briefsSent: [...state.briefsSent, id] })),
  reset: () => {
    for (const row of get().rows) revokeAssetUrls(row.assets)
    set(initial)
  },
}))
