import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PlatformConnectionPanel } from '@/components/dashboard/platform-connection-panel'

export default async function AppsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: googleToken } = await supabase
    .from('plataformas_tokens')
    .select('email_conectado, token_expiry, updated_at')
    .eq('plataforma', 'google_ads')
    .maybeSingle()

  const { data: googleCalendarToken } = await supabase
    .from('plataformas_tokens')
    .select('email_conectado, token_expiry, updated_at')
    .eq('plataforma', 'google_calendar')
    .maybeSingle()

  const { data: googleSheetsToken } = await supabase
    .from('plataformas_tokens')
    .select('email_conectado, token_expiry, updated_at')
    .eq('plataforma', 'google_sheets')
    .maybeSingle()

  const { data: discordInfo } = await supabase
    .from('colaboradores')
    .select('discord_id, discord_username')
    .eq('id', user.id)
    .single()

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Apps</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Conecta tus cuentas externas para integrar con la plataforma.
        </p>
      </div>

      <PlatformConnectionPanel
        googleToken={googleToken ?? null}
        googleCalendarToken={googleCalendarToken ?? null}
        googleSheetsToken={googleSheetsToken ?? null}
        discordInfo={discordInfo ?? null}
        appUrl={process.env.NEXT_PUBLIC_APP_URL || ''}
      />
    </div>
  )
}
