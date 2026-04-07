import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const META_API_VERSION = process.env.META_API_VERSION || 'v25.0'
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MetaAccountBudgetResult {
  adAccountId:          string
  adAccountName:        string
  accountStatus:        number
  currency:             string
  amountSpent:          number   // in account currency (already divided by 100)
  spendCap:             number   // in account currency (already divided by 100)
  balance:              number   // in account currency (already divided by 100)
  saldoPresupuestario:  number | null  // null when no spend_cap
  hasSpendCap:          boolean
  fundingSource:        string | null
}

const ACCOUNT_STATUS_LABEL: Record<number, string> = {
  1:   'Activa',
  2:   'Deshabilitada',
  3:   'Sin pagar',
  7:   'Archivada',
  9:   'En revision',
  100: 'Pendiente cierre',
  101: 'Cerrada',
  201: 'Limitada por anuncio',
}

// Meta returns monetary values as integer strings in the account currency's
// smallest unit (e.g. cents). Divide by 100 to get full units.
function metaMicrosToAmount(raw: string | number | undefined): number {
  const n = Number(raw ?? 0)
  return isNaN(n) ? 0 : n / 100
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rawAccountId = request.nextUrl.searchParams.get('account_id')
    if (!rawAccountId) {
      return NextResponse.json({ error: 'account_id es requerido' }, { status: 400 })
    }

    const accessToken = process.env.META_ADS_ACCESS_TOKEN
    if (!accessToken) {
      return NextResponse.json({ error: 'META_ADS_ACCESS_TOKEN no configurado' }, { status: 500 })
    }

    // Normalize — always strip act_ prefix before building URL
    const accountId = rawAccountId.replace(/^act_/, '')

    const fields = 'id,name,account_status,amount_spent,spend_cap,balance,currency,funding_source_details'
    const url = `${META_BASE_URL}/act_${accountId}?${new URLSearchParams({
      fields,
      access_token: accessToken,
    })}`

    let res: Response
    try {
      res = await fetch(url, { cache: 'no-store' })
    } catch (err) {
      return NextResponse.json({ error: `Error de red al conectar con Meta: ${err}` }, { status: 502 })
    }

    const json = await res.json()

    if (json.error) {
      return NextResponse.json(
        { error: `Meta API error (${json.error.code}): ${json.error.message}` },
        { status: res.status }
      )
    }

    const amountSpent = metaMicrosToAmount(json.amount_spent)
    const spendCap    = metaMicrosToAmount(json.spend_cap)
    const balance     = metaMicrosToAmount(json.balance)
    const hasSpendCap = spendCap > 0

    const result: MetaAccountBudgetResult = {
      adAccountId:         String(json.id ?? accountId),
      adAccountName:       String(json.name ?? ''),
      accountStatus:       Number(json.account_status ?? 0),
      currency:            String(json.currency ?? 'USD'),
      amountSpent,
      spendCap,
      balance,
      saldoPresupuestario: hasSpendCap ? spendCap - amountSpent : null,
      hasSpendCap,
      fundingSource:       json.funding_source_details?.display_string ?? null,
    }

    return NextResponse.json(
      { data: result },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
