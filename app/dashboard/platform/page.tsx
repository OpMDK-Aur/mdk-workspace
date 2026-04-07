import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PlatformConnectionPanel } from '@/components/dashboard/platform-connection-panel'
import { ClientsPlatformConfig } from '@/components/dashboard/clients-platform-config'

export default async function PlatformPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'direccion' && profile?.role !== 'project_manager') {
    redirect('/dashboard')
  }

  const { data: clients } = await supabase
    .from('clients')
    .select('id, business_name, meta_ads_account_id, google_ads_customer_id, crm_type, ghl_location_id, ghl_token, status')
    .order('business_name')

  const { data: googleToken } = await supabase
    .from('platform_tokens')
    .select('connected_email, token_expiry, updated_at')
    .eq('platform', 'google_ads')
    .maybeSingle()

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Plataformas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Conecta las cuentas de Google Ads y configura los IDs de cada cliente.
        </p>
      </div>

      <PlatformConnectionPanel
        googleToken={googleToken ?? null}
        appUrl={process.env.NEXT_PUBLIC_APP_URL || ''}
      />

      <div>
        <h2 className="text-lg font-semibold mb-4">IDs de clientes</h2>
        <ClientsPlatformConfig clients={clients || []} />
      </div>
    </div>
  )
}
