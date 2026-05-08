import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PlatformConnectionPanel } from '@/components/dashboard/platform-connection-panel'
import { ClientsPlatformConfig } from '@/components/dashboard/clients-platform-config'

export default async function PlatformPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('colaboradores')
    .select('rol_id')
    .eq('id', user.id)
    .single()

  // TODO: Check role via roles table join
  if (!profile) {
    redirect('/dashboard')
  }

  const { data: clientes, error: clientsError } = await supabase
    .from('Clientes')
    .select('id, nombre_del_negocio, meta_ads_account_id, google_ads_customer_id, crm_type, ghl_location_id, ghl_token')
    .order('nombre_del_negocio')

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

  const { data: discordInfo } = await supabase
    .from('colaboradores')
    .select('discord_id, discord_username')
    .eq('id', user.id)
    .single()

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Plataformas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Conecta las cuentas de Google Ads y Google Calendar, y configura los IDs de cada cliente.
        </p>
      </div>

      <PlatformConnectionPanel
        googleToken={googleToken ?? null}
        googleCalendarToken={googleCalendarToken ?? null}
        discordInfo={discordInfo ?? null}
        appUrl={process.env.NEXT_PUBLIC_APP_URL || ''}
      />

      <div>
        <h2 className="text-lg font-semibold mb-4">IDs de clientes</h2>
        <ClientsPlatformConfig clients={(clientes || []).map(c => ({
          id: c.id,
          business_name: c.nombre_del_negocio || '',
          meta_ads_account_id: c.meta_ads_account_id,
          google_ads_customer_id: c.google_ads_customer_id,
          crm_type: c.crm_type,
          ghl_location_id: c.ghl_location_id,
          ghl_token: c.ghl_token,
        }))} />
      </div>
    </div>
  )
}
