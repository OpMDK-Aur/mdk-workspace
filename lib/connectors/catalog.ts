export type ConnectorId =
  | 'google_ads' | 'google_analytics' | 'google_sheets' | 'google_calendar' | 'google_docs' | 'meta_ads' | 'discord'
  | 'instagram' | 'tiktok'
  | 'gohighlevel' | 'aurelia_crm' | 'kommo' | 'hubspot' | 'fidelity' | 'tecnom'
  | 'hostinger' | 'hostinger_email' | 'donweb' | 'cloudflare'
  | 'anthropic'

export type CredentialField = {
  name: string
  label: string
  type: 'text' | 'password' | 'email' | 'url'
  placeholder?: string
  help?: string
  optional?: boolean
  defaultValue?: string
}

export type ConnectorGroup = 'ai' | 'google' | 'social' | 'crm' | 'hosting' | 'other'

export type ConnectorDefinition = {
  id: ConnectorId
  name: string
  description: string
  logos: string[]
  /** Iniciales con el color de la marca cuando no hay un logo disponible. */
  monogram?: { text: string; color: string }
  group: ConnectorGroup
  /** `oauth` redirige al proveedor; `credentials` pide los datos en un formulario. */
  kind?: 'oauth' | 'credentials'
  fields?: CredentialField[]
  /** Si al conectar se prueba la credencial contra la API del proveedor. */
  verifies?: boolean
  helpUrl?: string
  /** Valor de `plataformas_tokens.plataforma`; Discord se guarda en `colaboradores`. */
  platform: string | null
  connectPath: string | null
  /** Las conexiones sin tu cuenta usan la credencial compartida de la agencia. */
  fallbackLabel?: string
}

export const CONNECTORS: ConnectorDefinition[] = [
  {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    description: 'Tu propia clave de Claude: el asistente responde con tu cuenta de Anthropic y el consumo se te factura a vos.',
    logos: [],
    monogram: { text: 'C', color: '#D97757' },
    group: 'ai',
    kind: 'credentials',
    platform: 'anthropic',
    connectPath: null,
    verifies: true,
    helpUrl: 'https://console.anthropic.com/settings/keys',
    fields: [
      { name: 'apiKey', label: 'API key de Anthropic', type: 'password', placeholder: 'sk-ant-…', help: 'console.anthropic.com → Settings → API Keys → Create Key.' },
    ],
    fallbackLabel: 'Sin tu clave, la IA usa la cuenta de la agencia.',
  },
  {
    id: 'google_ads',
    name: 'Google Ads',
    description: 'Las cuentas de Google Ads a las que tenés acceso, para asignarlas a tus clientes.',
    logos: ['/connectors/g-campanas.svg'],
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
    group: 'social',
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
  {
    id: 'instagram',
    name: 'Instagram',
    description: 'Perfil, publicaciones e insights de una cuenta profesional.',
    logos: ['/connectors/instagram.svg'],
    group: 'social',
    kind: 'credentials',
    platform: 'instagram',
    connectPath: null,
    verifies: true,
    helpUrl: 'https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started',
    fields: [
      { name: 'token', label: 'Token de acceso de Instagram', type: 'password', placeholder: 'IGAA…', help: 'Token de la API de Instagram (cuenta profesional). Dura 60 días y se puede renovar.' },
    ],
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    description: 'Campañas, anuncios y resultados de TikTok Ads.',
    logos: ['/connectors/tiktok.svg'],
    group: 'social',
    kind: 'credentials',
    platform: 'tiktok',
    connectPath: null,
    verifies: true,
    helpUrl: 'https://business-api.tiktok.com/portal/docs?id=1738373164380162',
    fields: [
      { name: 'token', label: 'Access token de TikTok for Business', type: 'password', help: 'Se genera al autorizar tu app en TikTok for Business (Marketing API).' },
      { name: 'advertiserId', label: 'Advertiser ID', type: 'text', placeholder: '7012345678901234567', help: 'Lo ves en TikTok Ads Manager, arriba a la derecha.' },
    ],
  },
  {
    id: 'gohighlevel',
    name: 'GoHighLevel',
    description: 'Contactos, oportunidades y conversaciones de una subcuenta (location).',
    logos: [],
    monogram: { text: 'GHL', color: '#155EEF' },
    group: 'crm',
    kind: 'credentials',
    platform: 'gohighlevel',
    connectPath: null,
    verifies: true,
    helpUrl: 'https://help.gohighlevel.com/support/solutions/articles/155000002774',
    fields: [
      { name: 'token', label: 'Token de integración privada', type: 'password', placeholder: 'pit-…', help: 'Configuración de la subcuenta → Integraciones privadas.' },
      { name: 'locationId', label: 'Location ID', type: 'text', placeholder: 've9EPM428h8vShlRW1KT' },
    ],
  },
  {
    id: 'aurelia_crm',
    name: 'Aurelia',
    description: 'Clientes, leads y conversaciones del CRM de Aurelia.',
    logos: [],
    monogram: { text: 'SA', color: '#65A30D' },
    group: 'crm',
    kind: 'credentials',
    platform: 'aurelia_crm',
    connectPath: null,
    verifies: false,
    fields: [
      { name: 'accountId', label: 'ID de cuenta', type: 'text', placeholder: 'ID de la cuenta en Aurelia' },
      { name: 'token', label: 'Token de API', type: 'password' },
    ],
  },
  {
    id: 'kommo',
    name: 'Kommo',
    description: 'Leads, contactos y embudos de ventas.',
    logos: [],
    monogram: { text: 'K', color: '#1D6FF2' },
    group: 'crm',
    kind: 'credentials',
    platform: 'kommo',
    connectPath: null,
    verifies: true,
    helpUrl: 'https://developers.kommo.com/docs/long-lived-token',
    fields: [
      { name: 'subdomain', label: 'Subdominio', type: 'text', placeholder: 'miempresa', help: 'Lo que va antes de .kommo.com.' },
      { name: 'token', label: 'Token de larga duración', type: 'password', help: 'Configuración → Integraciones → tu integración privada → Claves y alcances.' },
    ],
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'Contactos, negocios y empresas del CRM.',
    logos: ['/connectors/hubspot.svg'],
    group: 'crm',
    kind: 'credentials',
    platform: 'hubspot',
    connectPath: null,
    verifies: true,
    helpUrl: 'https://developers.hubspot.com/docs/api/private-apps',
    fields: [
      { name: 'token', label: 'Token de app privada', type: 'password', placeholder: 'pat-na1-…', help: 'Configuración → Integraciones → Apps privadas.' },
    ],
  },
  {
    id: 'fidelity',
    name: 'Fidelity',
    description: 'Leads y seguimiento comercial de concesionarias.',
    logos: [],
    monogram: { text: 'F', color: '#0F766E' },
    group: 'crm',
    kind: 'credentials',
    platform: 'fidelity',
    connectPath: null,
    verifies: false,
    fields: [
      { name: 'apiUrl', label: 'URL de la API', type: 'url', placeholder: 'https://…', help: 'La que te da Fidelity para tu cuenta.' },
      { name: 'username', label: 'Usuario', type: 'text', optional: true },
      { name: 'token', label: 'Token o contraseña de API', type: 'password' },
    ],
  },
  {
    id: 'tecnom',
    name: 'Tecnom',
    description: 'Envío y consulta de leads del CRM automotriz.',
    logos: [],
    monogram: { text: 'T', color: '#DC2626' },
    group: 'crm',
    kind: 'credentials',
    platform: 'tecnom',
    connectPath: null,
    verifies: false,
    fields: [
      { name: 'apiUrl', label: 'URL del endpoint', type: 'url', placeholder: 'https://…', help: 'La que te da Tecnom para tu concesionaria.' },
      { name: 'token', label: 'Token de acceso', type: 'password' },
    ],
  },
  {
    id: 'hostinger',
    name: 'Hostinger hPanel',
    description: 'Dominios, hosting y VPS de la cuenta.',
    logos: ['/connectors/hostinger.svg'],
    group: 'hosting',
    kind: 'credentials',
    platform: 'hostinger',
    connectPath: null,
    verifies: true,
    helpUrl: 'https://developers.hostinger.com',
    fields: [
      { name: 'token', label: 'Token de API', type: 'password', help: 'hPanel → Perfil → API.' },
    ],
  },
  {
    id: 'hostinger_email',
    name: 'Hostinger Email',
    description: 'Casilla de correo para enviar y leer emails.',
    logos: ['/connectors/hostinger.svg'],
    group: 'hosting',
    kind: 'credentials',
    platform: 'hostinger_email',
    connectPath: null,
    verifies: true,
    fields: [
      { name: 'email', label: 'Email', type: 'email', placeholder: 'nombre@tudominio.com' },
      { name: 'password', label: 'Contraseña de la casilla', type: 'password' },
    ],
  },
  {
    id: 'donweb',
    name: 'DonWeb (cPanel)',
    description: 'Hosting, dominios y casillas del cPanel de DonWeb.',
    logos: [],
    monogram: { text: 'DW', color: '#0070C9' },
    group: 'hosting',
    kind: 'credentials',
    platform: 'donweb',
    connectPath: null,
    verifies: true,
    helpUrl: 'https://docs.cpanel.net/cpanel/security/manage-api-tokens-in-cpanel/',
    fields: [
      { name: 'host', label: 'Servidor de cPanel', type: 'text', placeholder: 'tudominio.com', help: 'El dominio con el que entrás a cPanel (sin https ni :2083).' },
      { name: 'username', label: 'Usuario de cPanel', type: 'text' },
      { name: 'token', label: 'Token de API de cPanel', type: 'password', help: 'cPanel → Seguridad → Administrar tokens de API.' },
    ],
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    description: 'Zonas, DNS y caché de los dominios.',
    logos: ['/connectors/cloudflare.svg'],
    group: 'hosting',
    kind: 'credentials',
    platform: 'cloudflare',
    connectPath: null,
    verifies: true,
    helpUrl: 'https://developers.cloudflare.com/fundamentals/api/get-started/create-token/',
    fields: [
      { name: 'token', label: 'Token de API', type: 'password', help: 'Mi perfil → Tokens de API. Con permiso de lectura de zonas alcanza.' },
    ],
  },
]

export const CONNECTOR_BY_ID = Object.fromEntries(CONNECTORS.map((connector) => [connector.id, connector])) as Record<ConnectorId, ConnectorDefinition>

export const CREDENTIALS_VERIFIED_SCOPE = 'credentials:verified'
export const CREDENTIALS_UNVERIFIED_SCOPE = 'credentials:unverified'

/**
 * Id del DOM de la tarjeta. Evita "ads" porque los bloqueadores de anuncios
 * (Brave, uBlock, AdBlock) ocultan elementos con ids como `google_ads`.
 */
export function connectorAnchor(id: ConnectorId) {
  return `conector-${id.replace(/_ads$/, '_campanas').replace(/_/g, '-')}`
}

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
  /** false cuando las credenciales se guardaron sin poder probarlas contra el proveedor. */
  verified: boolean
}

type TokenRow = { plataforma: string; email_conectado: string | null; token_expiry: string | null; updated_at: string | null; has_refresh_token: boolean; scope?: string | null }

/** Arma el estado de cada conector a partir de las filas de `plataformas_tokens` del usuario. */
export function buildConnectorStatuses(rows: TokenRow[], discord: { discord_id: string | null; discord_username: string | null } | null, now = Date.now()): ConnectorStatus[] {
  return CONNECTORS.map((connector) => {
    if (connector.id === 'discord') {
      return { id: connector.id, connected: Boolean(discord?.discord_id), email: discord?.discord_username ?? null, connectedAt: null, expired: false, verified: true }
    }
    const row = rows
      .filter((item) => item.plataforma === connector.platform)
      .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))[0]
    if (!row) return { id: connector.id, connected: false, email: null, connectedAt: null, expired: false, verified: true }
    const expiry = row.token_expiry ? new Date(row.token_expiry).getTime() : null
    return {
      id: connector.id,
      connected: true,
      email: row.email_conectado,
      connectedAt: row.updated_at,
      expired: !row.has_refresh_token && expiry !== null && expiry < now,
      verified: row.scope !== CREDENTIALS_UNVERIFIED_SCOPE,
    }
  })
}
