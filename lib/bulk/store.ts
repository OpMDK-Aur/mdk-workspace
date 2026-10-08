'use client'

import { create } from 'zustand'
import { groupAssets, mergeRows, newId, revokeAssetUrls } from './group-assets'
import type { BulkAsset, BulkDefaults, BulkRow, CreativeSuggestion, PublishInitialStatus } from './types'

export type BulkStep = 1 | 2 | 3
export type PublishPhase = 'idle' | 'publishing' | 'finished'

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
  setClient: (clientId: string, defaults: BulkDefaults) => void
  setStep: (step: BulkStep) => void
  setDefaults: (defaults: Partial<BulkDefaults>) => void
  addAssets: (assets: BulkAsset[]) => void
  addSuggestion: (suggestion: CreativeSuggestion) => void
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

const initial = { step: 1 as BulkStep, rows: [], selected: [], initialStatus: 'PAUSED' as PublishInitialStatus, publishPhase: 'idle' as PublishPhase, publishProgress: 0 }

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
