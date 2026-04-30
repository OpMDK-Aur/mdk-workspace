import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface MetaAdAccount {
  id: string
  name: string
  account_status: number
  currency: string
  account_id: string
}

interface MetaAccountsResponse {
  data: MetaAdAccount[]
  paging?: { cursors: { before: string; after: string }; next?: string }
  error?: { message: string; code: number }
}

const META_API_VERSION = process.env.META_API_VERSION || 'v25.0'
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`

// account_status: 1=ACTIVE, 2=DISABLED, 3=UNSETTLED, 7=PENDING_RISK_REVIEW, 9=IN_GRACE_PERIOD, 101=TEMPORARILY_CLOSED, 201=CLOSED
const STATUS_LABELS: Record<number, string> = {
  1: 'Activa',
  2: 'Deshabilitada',
  3: 'Deuda pendiente',
  7: 'Revision de riesgo',
  9: 'Periodo de gracia',
  101: 'Temporalmente cerrada',
  201: 'Cerrada',
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: colaborador } = await supabase
      .from('colaboradores')
      .select('rol_id')
      .eq('id', user.id)
      .single()

    // TODO: Check rol_id for access control
    if (!colaborador) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const accessToken = process.env.META_ADS_ACCESS_TOKEN
    if (!accessToken) {
      return NextResponse.json({ error: 'META_ADS_ACCESS_TOKEN no configurado' }, { status: 500 })
    }

    // Fetch all ad accounts accessible to this token (paginated)
    const allAccounts: MetaAdAccount[] = []
    let url: string | null = `${META_BASE_URL}/me/adaccounts?${new URLSearchParams({
      access_token: accessToken,
      fields: 'id,name,account_status,currency,account_id',
      limit: '200',
    })}`

    while (url) {
      const res = await fetch(url)
      const json: MetaAccountsResponse = await res.json()

      if (json.error) {
        return NextResponse.json({ error: json.error.message }, { status: 400 })
      }

      allAccounts.push(...(json.data ?? []))
      url = json.paging?.next ?? null
    }

    // Normalize: strip act_ prefix from id for consistent storage
    const accounts = allAccounts.map(a => ({
      id: a.id.replace(/^act_/, ''),          // numeric only, e.g. "703723247173991"
      raw_id: a.id,                            // e.g. "act_703723247173991"
      name: a.name,
      status: a.account_status,
      status_label: STATUS_LABELS[a.account_status] ?? `Estado ${a.account_status}`,
      currency: a.currency,
      is_active: a.account_status === 1,
    }))

    return NextResponse.json({ accounts, total: accounts.length })
  } catch (error: any) {
    console.error('[meta-accounts]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
