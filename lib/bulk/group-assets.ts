import type { BulkAsset, BulkDefaults, BulkRow, Ratio } from './types'

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime']

const RATIO_SUFFIXES: Record<string, Ratio> = { '1x1': '1:1', '4x5': '4:5', '9x16': '9:16', '16x9': '1.91:1', '191x1': '1.91:1' }
const RATIO_SUFFIX_PATTERN = /[_-](1x1|4x5|9x16|16x9|191x1)(?=[_-]|$)/gi
const PLACEMENT_SUFFIX_PATTERN = /[_-](feed|story|stories|reels)(?=[_-]|$)/gi

export function newId(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function stripExtension(name: string) {
  return name.replace(/\.[^.]+$/, '')
}

export function ratioFromName(name: string): Ratio | null {
  const match = stripExtension(name).toLowerCase().match(/[_-](1x1|4x5|9x16|16x9|191x1)(?=[_-]|$)/)
  return match ? RATIO_SUFFIXES[match[1]] : null
}

export function ratioFromDimensions(width: number, height: number): Ratio {
  if (!width || !height) return '1:1'
  const value = width / height
  if (value < 0.7) return '9:16'
  if (value < 0.9) return '4:5'
  if (value < 1.25) return '1:1'
  return '1.91:1'
}

export function baseNameOf(name: string) {
  const cleaned = stripExtension(name).replace(RATIO_SUFFIX_PATTERN, '').replace(PLACEMENT_SUFFIX_PATTERN, '').toLowerCase().trim()
  return cleaned || stripExtension(name).toLowerCase()
}

function readDimensions(file: File, url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    if (file.type.startsWith('video/')) {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight })
      video.onerror = () => resolve({ width: 0, height: 0 })
      video.src = url
      return
    }
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => resolve({ width: 0, height: 0 })
    image.src = url
  })
}

export async function filesToAssets(files: File[]): Promise<BulkAsset[]> {
  const accepted = files.filter((file) => ACCEPTED_TYPES.includes(file.type))
  return Promise.all(accepted.map(async (file) => {
    const url = URL.createObjectURL(file)
    const ratio = ratioFromName(file.name) ?? ratioFromDimensions(...Object.values(await readDimensions(file, url)) as [number, number])
    return { id: newId('asset'), file, name: file.name, kind: file.type.startsWith('video/') ? 'video' : 'image', url, ratio } satisfies BulkAsset
  }))
}

export function groupAssets(assets: BulkAsset[], defaults: BulkDefaults): BulkRow[] {
  const groups = new Map<string, BulkAsset[]>()
  for (const asset of assets) {
    const key = baseNameOf(asset.name)
    groups.set(key, [...(groups.get(key) ?? []), asset])
  }
  return [...groups.entries()].map(([baseName, groupAssets]) => ({
    id: newId('row'),
    baseName,
    assets: groupAssets,
    adsetId: defaults.adsetId,
    cta: defaults.cta,
    primaryText: '',
    headline: '',
    status: 'idle',
  }))
}

export function mergeRows(existing: BulkRow[], incoming: BulkRow[]): BulkRow[] {
  const merged = [...existing]
  for (const row of incoming) {
    const match = merged.find((item) => item.baseName === row.baseName && !item.fromSuggestion)
    if (match) match.assets = [...match.assets, ...row.assets]
    else merged.push(row)
  }
  return merged
}

export const isFeedRatio = (ratio: Ratio) => ratio !== '9:16'

export function derivePlacement(assets: BulkAsset[]) {
  const hasVertical = assets.some((asset) => asset.ratio === '9:16')
  const hasFeed = assets.some((asset) => isFeedRatio(asset.ratio))
  if (hasVertical && hasFeed) return 'Feed + Stories y Reels'
  if (hasVertical) return 'Solo Stories y Reels'
  return 'Feed'
}

function slug(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function adName({ clientName, adsetName, baseName, index }: { clientName: string; adsetName: string; baseName: string; index: number }) {
  return `${slug(clientName).toUpperCase() || 'CLIENTE'}_${slug(adsetName).toLowerCase() || 'conjunto'}_${slug(baseName).toLowerCase() || 'pieza'}_${String(index + 1).padStart(2, '0')}`
}

export function revokeAssetUrls(assets: BulkAsset[]) {
  for (const asset of assets) if (asset.file && asset.url) URL.revokeObjectURL(asset.url)
}
