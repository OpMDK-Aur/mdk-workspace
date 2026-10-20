import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { META_APP_ID, META_GRAPH_VERSION, META_PLATFORM_KEY, clearMetaTokenCache } from '@/lib/meta-ads/token'

const STATE_COOKIE = 'meta_oauth_state'
const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`

type TokenResponse = { access_token?: string; expires_in?: number; error?: { message?: string } }

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  const back = (params: Record<string, string>) => {
    const response = NextResponse.redirect(new URL(`/dashboard/apps?${new URLSearchParams(params)}`, appUrl))
    response.cookies.delete(STATE_COOKIE)
    return response
  }

  const params = request.nextUrl.searchParams
  if (params.get('error')) return back({ error: 'meta_denied' })
  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state || state !== request.cookies.get(STATE_COOKIE)?.value) return back({ error: 'meta_state' })

  const secret = process.env.META_APP_SECRET?.trim()
  if (!secret) return back({ error: 'config_error' })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return back({ error: 'not_authenticated' })

  try {
    const shortRes = await fetch(`${GRAPH}/oauth/access_token?${new URLSearchParams({
      client_id: META_APP_ID,
      client_secret: secret,
      redirect_uri: `${appUrl}/api/auth/meta/callback`,
      code,
    })}`, { cache: 'no-store' })
    const short = (await shortRes.json()) as TokenResponse
    if (!short.access_token) return back({ error: 'token_error', msg: short.error?.message ?? 'Sin token' })

    const longRes = await fetch(`${GRAPH}/oauth/access_token?${new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: META_APP_ID,
      client_secret: secret,
      fb_exchange_token: short.access_token,
    })}`, { cache: 'no-store' })
    const long = (await longRes.json()) as TokenResponse
    const accessToken = long.access_token ?? short.access_token
    const expiresIn = long.access_token ? long.expires_in : short.expires_in

    const [meRes, permsRes] = await Promise.all([
      fetch(`${GRAPH}/me?fields=name,email&access_token=${accessToken}`, { cache: 'no-store' }),
      fetch(`${GRAPH}/me/permissions?access_token=${accessToken}`, { cache: 'no-store' }),
    ])
    const me = (await meRes.json()) as { name?: string; email?: string }
    const perms = (await permsRes.json()) as { data?: { permission: string; status: string }[] }
    const scope = (perms.data ?? []).filter((p) => p.status === 'granted').map((p) => p.permission).join(',')

    const admin = createAdminClient()
    await admin.from('plataformas_tokens').delete().eq('plataforma', META_PLATFORM_KEY)
    const now = new Date().toISOString()
    const { error: dbError } = await admin.from('plataformas_tokens').insert({
      cliente_id: user.id,
      plataforma: META_PLATFORM_KEY,
      nombre_cuenta: me.name ? `Meta · ${me.name}` : 'Meta',
      access_token: accessToken,
      refresh_token: null,
      token_expiry: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      email_conectado: me.email ?? me.name ?? null,
      scope: scope || null,
      activo: true,
      created_at: now,
      updated_at: now,
    })
    if (dbError) return back({ error: 'db_error', msg: dbError.message })

    clearMetaTokenCache()
    return back({ connected: 'meta' })
  } catch (error) {
    console.error('[meta-callback] Error:', error)
    return back({ error: 'unknown' })
  }
}
