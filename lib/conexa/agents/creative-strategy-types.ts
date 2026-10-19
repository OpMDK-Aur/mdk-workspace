export const CREATIVE_FORMATS = ['Video corto', 'Imagen', 'Carrusel', 'UGC'] as const
export const CREATIVE_ANGLES = ['Problema-solución', 'Testimonial', 'Educativo', 'Comparación', 'Urgencia'] as const

export type CreativeFormat = (typeof CREATIVE_FORMATS)[number]
export type CreativeAngle = (typeof CREATIVE_ANGLES)[number]
export type CreativeStatus = 'por_disenar' | 'en_diseno' | 'listo'
export type PersonasCount = 3 | 4 | 5

export type Creative = {
  id: string
  personaId: string
  painId: string
  format: CreativeFormat
  angle: CreativeAngle
  hook: string
  message: string
  cta: string
  andromedaSignal: string
  taskId?: string
  assigneeName?: string
  status: CreativeStatus
}

export type Persona = {
  id: string
  name: string
  profile: string
  wants: string
  pains: { id: string; text: string }[]
  creatives: Creative[]
}

export type StrategySources = { crm: boolean; ga4: boolean; metaHistory: boolean; competitors: boolean }

export type StrategyInput = {
  business: string
  website: string
  goal: string
  personasCount: PersonasCount
  sources: StrategySources
}

export type StrategyRun = {
  id: string
  clientId: string
  createdBy: string
  createdByName?: string | null
  createdAt: string
  input: StrategyInput
  personas: Persona[]
  persisted?: boolean
}

export type SendToDesignBody = {
  creativeIds: string[]
  groupBy: 'creative' | 'persona'
  assigneeId: string
  dueDate: string | null
  priority: 'alta' | 'media' | 'baja'
  clientName: string
}

export type DesignAssignee = { id: string; name: string; avatarUrl: string | null; isDesign: boolean; recent: boolean }

export const FORMAT_SWATCH: Record<CreativeFormat, string> = {
  'Video corto': 'bg-[#FF7F00]',
  Imagen: 'bg-[#5B5FE8]',
  Carrusel: 'bg-[#141414] dark:bg-[#EDEDEF]',
  UGC: 'bg-[#2E7D5B]',
}

export function taskCode(taskId: string) {
  return `MDK-${taskId.replace(/-/g, '').slice(0, 5).toUpperCase()}`
}

export function allCreatives(run: StrategyRun) {
  return run.personas.flatMap((persona) => persona.creatives)
}

export function strategyCounts(run: StrategyRun) {
  const creatives = allCreatives(run)
  return {
    personas: run.personas.length,
    creatives: creatives.length,
    inDesign: creatives.filter((creative) => creative.status !== 'por_disenar').length,
  }
}

export function creativeTaskTitle(creative: Creative, persona: Persona) {
  return `${creative.id} · ${creative.format} · ${persona.name}`
}

export function personaTaskTitle(persona: Persona, clientName: string) {
  return `Creativos Meta · ${persona.name} · ${clientName}`
}

export function personaTaskMeta(creatives: Creative[]) {
  const list = creatives.map((creative) => `${creative.id} ${creative.format.toLowerCase()}`).join(', ')
  return `${creatives.length} ${creatives.length === 1 ? 'pieza' : 'piezas'}: ${list}`
}

export function relativeTime(iso: string, now = Date.now()) {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'recién'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.round(hours / 24)
  return days === 1 ? 'ayer' : `hace ${days} días`
}
