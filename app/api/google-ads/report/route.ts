import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  type ResourceName,
  buildDateFilter,
  sanitizeColumns,
  buildGaqlQuery,
  fetchGaqlRows,
  normalizeRow,
  getDefaultColumns,
  RESOURCE_COLUMNS,
} from '@/lib/google-ads'

const GOOGLE_ADS_API_VERSION = 'v23'
const GOOGLE_ADS_BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`

const SUPPORTED_RESOURCES: ResourceName[] = ['campaign', 'ad_group_ad', 'keyword_view']

// ---------------------------------------------------------------------------
// Access token — from session provider_token or platform_tokens table
// ---------------------------------------------------------------------------
async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.provider_token) return session.provider_token

    // Fallback: refresh via stored refresh_token
    const { data: tokenRow } = await supabase
      .from('platform_tokens')
      .select('refresh_token')
      .eq('platform', 'google_ads')
      .maybeSingle()

    const refreshToken = tokenRow?.refresh_token ?? process.env.GOOGLE_ADS_REFRESH_TOKEN ?? null
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (!refreshToken || !clientId || !clientSecret) return null

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    })
    const data = await res.json()
    return data.access_token ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sp = request.nextUrl.searchParams

    // Required params
    const customerId = sp.get('customer_id')
    if (!customerId) return NextResponse.json({ error: 'customer_id is required' }, { status: 400 })

    const resource = (sp.get('resource') ?? 'campaign') as ResourceName
    if (!SUPPORTED_RESOURCES.includes(resource)) {
      return NextResponse.json({
        error: `Recurso no soportado: "${resource}". Valores válidos: ${SUPPORTED_RESOURCES.join(', ')}`,
      }, { status: 400 })
    }

    // Columns — comma-separated list, falls back to resource defaults
    const rawColumns = sp.get('columns')
    const requestedColumns = rawColumns
      ? rawColumns.split(',').map(c => c.trim()).filter(Boolean)
      : getDefaultColumns(resource)

    const validColumns = sanitizeColumns(requestedColumns, resource)
    if (validColumns.length === 0) {
      return NextResponse.json({
        error: `Ninguna de las columnas solicitadas es válida para el recurso "${resource}". Columnas disponibles: ${RESOURCE_COLUMNS[resource].map(c => c.field).join(', ')}`,
      }, { status: 400 })
    }

    // Date range
    const dateRange  = sp.get('date_range') ?? 'last_30d'
    const startDate  = sp.get('start_date') ?? undefined
    const endDate    = sp.get('end_date') ?? undefined

    // Optional filters
    const campaignType           = sp.get('campaign_type') ?? undefined
    const campaignStatus         = sp.get('campaign_status') ?? undefined
    const keyword                = sp.get('keyword') ?? undefined
    const conversionActionName   = sp.get('conversion_action_name') ?? undefined
    const limit                  = sp.get('limit') ? Number(sp.get('limit')) : undefined

    // Credentials
    const accessToken    = await getAccessToken()
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '4435948073'

    if (!accessToken) {
      return NextResponse.json({
        error: 'No se pudo obtener el access token de Google. El usuario debe re-autorizar Google OAuth desde Plataformas.',
      }, { status: 401 })
    }
    if (!developerToken) {
      return NextResponse.json({ error: 'GOOGLE_ADS_DEVELOPER_TOKEN no configurado.' }, { status: 500 })
    }

    const cleanCustomerId = customerId.replace(/-/g, '')
    const { clause: dateClause, start: rangeStart, end: rangeEnd } = buildDateFilter(dateRange, startDate, endDate)

    // Build GAQL
    const gaql = buildGaqlQuery({
      resource,
      columns: validColumns,
      dateClause,
      campaignType,
      campaignStatus,
      keyword,
      conversionActionName,
      limit,
    })

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'login-customer-id': loginCustomerId,
    }

    const { rows: rawRows, error: apiError } = await fetchGaqlRows(cleanCustomerId, gaql, headers)

    if (apiError) {
      return NextResponse.json({ error: apiError }, { status: 400 })
    }

    // Normalize rows
    const rows = rawRows.map(raw => normalizeRow(raw, validColumns))

    return NextResponse.json({
      platform: 'google',
      customer_id: customerId,
      resource,
      date_range: { start: rangeStart, end: rangeEnd },
      columns: validColumns,
      rows,
      meta: {
        row_count: rows.length,
        from_cache: false,
      },
    })
  } catch (err) {
    console.error('[google-ads/report] Unhandled error:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
