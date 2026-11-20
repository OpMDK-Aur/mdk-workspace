/**
 * Vistas de Conexa y su slug en la URL (`/dashboard/conexa?vista=<slug>`).
 * El sidebar general navega con estos links y Conexa abre la vista que dice la URL.
 */
export const CONEXA_PATH = '/dashboard/conexa'
export const CONEXA_VIEW_PARAM = 'vista'

export const CONEXA_VIEWS = {
  inicio: 'Inicio',
  tablero: 'Tablero',
  recomendaciones: 'Recomendaciones',
  aprobaciones: 'Aprobaciones',
  'meta-ads': 'Meta Ads',
  'google-ads': 'Google Ads',
  'google-analytics': 'Google Analytics',
  'tag-manager': 'Tag Manager',
  crm: 'CRM',
  contexto: 'Contexto del cliente',
  supervisor: 'Agente supervisor',
  informes: 'Informes',
  chat: 'Chat / Análisis',
} as const

export type ConexaViewSlug = keyof typeof CONEXA_VIEWS
export const DEFAULT_CONEXA_VIEW: ConexaViewSlug = 'inicio'

export const CONEXA_WORK_LINKS: ConexaViewSlug[] = ['inicio', 'tablero', 'recomendaciones', 'aprobaciones']
export const CONEXA_PLATFORM_LINKS: ConexaViewSlug[] = ['meta-ads', 'google-ads', 'google-analytics', 'tag-manager', 'crm']
export const CONEXA_CLIENT_LINKS: ConexaViewSlug[] = ['contexto', 'supervisor']

export function conexaViewFromSlug(slug: string | null | undefined): string {
  return slug && slug in CONEXA_VIEWS ? CONEXA_VIEWS[slug as ConexaViewSlug] : CONEXA_VIEWS[DEFAULT_CONEXA_VIEW]
}

export function conexaSlugFromView(view: string): ConexaViewSlug | null {
  const match = Object.entries(CONEXA_VIEWS).find(([, label]) => label === view)
  return match ? (match[0] as ConexaViewSlug) : null
}

export const conexaViewHref = (slug: ConexaViewSlug) => `${CONEXA_PATH}?${CONEXA_VIEW_PARAM}=${slug}`
