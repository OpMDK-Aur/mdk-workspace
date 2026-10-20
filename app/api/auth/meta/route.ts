import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { META_APP_ID, META_GRAPH_VERSION, META_OAUTH_SCOPES } from '@/lib/meta-ads/token'

const STATE_COOKIE = 'meta_oauth_state'

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth/login', appUrl))

  const state = randomBytes(16).toString('hex')
  const dialog = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`)
  dialog.search = new URLSearchParams({
    client_id: META_APP_ID,
    redirect_uri: `${appUrl}/api/auth/meta/callback`,
    state,
    scope: META_OAUTH_SCOPES.join(','),
    response_type: 'code',
    // Forces Meta to show the page/portfolio picker again instead of reusing the previous selection.
    auth_type: 'rerequest',
  }).toString()

  const response = NextResponse.redirect(dialog)
  response.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/' })
  return response
}
