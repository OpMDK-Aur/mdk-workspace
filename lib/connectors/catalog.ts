export type ConnectorId = 'google_ads' | 'google_analytics' | 'google_sheets' | 'google_calendar' | 'google_docs' | 'meta_ads' | 'discord'

export type ConnectorDefinition = {
  id: ConnectorId
  name: string
  description: string
  logos: string[]
  group: 'google' | 'other'
  /** Valor de `plataformas_tokens.plataforma`; Discord se guarda en `colaboradores`. */
  platform: string | null
  connectPath: string | null
  /** Las conexiones sin tu cuenta usan la credencial compartida de la agencia. */
  fallbackLabel?: string
}

export const CONNECTORS: ConnectorDefinition[] = [
  {
    id: 'google_ads',
    name: 'Google Ads',
    description: 'Las cuentas de Google Ads a las que tenés acceso, para asignarlas a tus clientes.',
    logos: ['/connectors/google-ads.svg'],
    group: 'google',
    platform: 'google_ads',
    connectPath: '/api/auth/google-ads',
    fallbackLabel: 'Sin tu cuenta se usa el acceso de la agencia (MCC).',
  },
  {
    id: 'google_analytics',
    name: 'Google Analytics + Tag Manager',
    description: 'Propiedades GA4 y contenedores de GTM de tu cuenta de Google.',
    logos: ['/connectors/google-analytics.svg', '/connectors/google-tag-manager.svg'],
    group: 'google',
    platform: 'google_analytics',
    connectPath: '/api/auth/google-analytics',
  },
  {
    id: 'google_sheets',
    name: 'Google Sheets',
    description: 'Leer planillas para el CRM, presupuestos y la carga masiva.',
    logos: ['/connectors/google-sheets.svg'],
    group: 'google',
    platform: 'google_sheets',
    connectPath: '/api/auth/google-sheets',
  },
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    description: 'Agendar reuniones con clientes desde las tareas.',
    logos: ['/connectors/google-calendar.svg'],
    group: 'google',
    platform: 'google_calendar',
    connectPath: '/api/auth/google-calendar',
    fallbackLabel: 'Sin tu cuenta se usa el calendario de la agencia.',
  },
  {
    id: 'google_docs',
    name: 'Google Docs y Drive',
    description: 'Leer documentos y archivos de Drive, como briefs y propuestas.',
    logos: ['/connectors/google-docs.svg'],
    group: 'google',
    platform: 'google_docs',
    connectPath: '/api/auth/google-docs',
  },
  {
    id: 'meta_ads',
    name: 'Meta',
    description: 'Cuentas publicitarias y fanpages de Facebook e Instagram.',
    logos: ['/connectors/meta.svg'],
    group: 'other',
    platform: 'meta_ads',
    connectPath: '/api/auth/meta',
    fallbackLabel: 'Sin tu cuenta se usa el token de la agencia.',
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Recibir notificaciones y avisos del equipo.',
    logos: ['/connectors/discord.svg'],
    group: 'other',
    platform: null,
    connectPath: null,
  },
]

export const CONNECTOR_BY_ID = Object.fromEntries(CONNECTORS.map((connector) => [connector.id, connector])) as Record<ConnectorId, ConnectorDefinition>

export function isConnectorId(value: string): value is ConnectorId {
  return value in CONNECTOR_BY_ID
}

export type ConnectorStatus = {
  id: ConnectorId
  connected: boolean
  email: string | null
  connectedAt: string | null
  /** El access token venció y no hay refresh token para renovarlo. */
  expired: boolean
}

type TokenRow = { plataforma: string; email_conectado: string | null; token_expiry: string | null; updated_at: string | null; has_refresh_token: boolean }

/** Arma el estado de cada conector a partir de las filas de `plataformas_tokens` del usuario. */
export function buildConnectorStatuses(rows: TokenRow[], discord: { discord_id: string | null; discord_username: string | null } | null, now = Date.now()): ConnectorStatus[] {
  return CONNECTORS.map((connector) => {
    if (connector.id === 'discord') {
      return { id: connector.id, connected: Boolean(discord?.discord_id), email: discord?.discord_username ?? null, connectedAt: null, expired: false }
    }
    const row = rows
      .filter((item) => item.plataforma === connector.platform)
      .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))[0]
    if (!row) return { id: connector.id, connected: false, email: null, connectedAt: null, expired: false }
    const expiry = row.token_expiry ? new Date(row.token_expiry).getTime() : null
    return {
      id: connector.id,
      connected: true,
      email: row.email_conectado,
      connectedAt: row.updated_at,
      expired: !row.has_refresh_token && expiry !== null && expiry < now,
    }
  })
}
