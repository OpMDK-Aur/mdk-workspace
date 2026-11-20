import type { Metadata } from 'next'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { ConnectorsGrid } from '@/components/connectors/connectors-grid'
import { AdAccountsShortcut, type AssignedClient } from '@/components/connectors/ad-accounts-shortcut'
import { buildConnectorStatuses, CONNECTORS, type ConnectorId } from '@/lib/connectors/catalog'

export const metadata: Metadata = {
  title: 'Conectores',
  description: 'Conectá tus cuentas de Google, Meta, CRM, hosting y Discord, y asigná las cuentas publicitarias de tus clientes.',
}

const hasValue = (value: unknown) => Array.isArray(value) ? value.length > 0 : Boolean(value)

export default async function ConnectorsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const platforms = CONNECTORS.map((connector) => connector.platform).filter((platform): platform is string => Boolean(platform))
  const [{ data: tokenRows }, { data: discordInfo }, { data: assignedClients }] = await Promise.all([
    createAdminClient()
      .from('plataformas_tokens')
      .select('plataforma, email_conectado, token_expiry, updated_at, refresh_token, scope')
      .eq('cliente_id', user.id)
      .eq('activo', true)
      .in('plataforma', platforms),
    supabase.from('colaboradores').select('discord_id, discord_username').eq('id', user.id).maybeSingle(),
    supabase
      .from('clientes')
      .select('id, nombre_del_negocio, meta_ads_account_id, meta_ads_account_ids, google_ads_customer_id, google_ads_customer_ids, analytics_property_id, tag_manager_container_id, crm_type')
      .or(`project_manager_id.eq.${user.id},account_manager_id.eq.${user.id}`)
      .not('activo', 'is', false)
      .order('nombre_del_negocio')
      .limit(100),
  ])

  const statuses = buildConnectorStatuses(
    (tokenRows ?? []).map(({ refresh_token, ...row }) => ({ ...row, has_refresh_token: Boolean(refresh_token) })),
    discordInfo ?? null,
  )
  const isConnected = (id: ConnectorId) => Boolean(statuses.find((status) => status.id === id)?.connected)

  const clients: AssignedClient[] = (assignedClients ?? []).map((client) => ({
    id: client.id,
    name: client.nombre_del_negocio || 'Cliente sin nombre',
    assignments: [
      { key: 'meta', label: 'Meta Ads', assigned: hasValue(client.meta_ads_account_id) || hasValue(client.meta_ads_account_ids), needsConnector: null },
      { key: 'google_ads', label: 'Google Ads', assigned: hasValue(client.google_ads_customer_id) || hasValue(client.google_ads_customer_ids), needsConnector: null },
      { key: 'analytics', label: 'GA4', assigned: hasValue(client.analytics_property_id), needsConnector: isConnected('google_analytics') ? null : 'google_analytics' },
      { key: 'gtm', label: 'Tag Manager', assigned: hasValue(client.tag_manager_container_id), needsConnector: isConnected('google_analytics') ? null : 'google_analytics' },
      { key: 'crm', label: 'CRM', assigned: hasValue(client.crm_type), needsConnector: null },
    ],
  }))

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground">Conectores</h1>
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
          Conectá tus propias cuentas una sola vez. Después asigná las cuentas publicitarias de cada cliente.
        </p>
      </header>

      <section aria-labelledby="connectors-title" className="flex flex-col gap-4">
        <h2 id="connectors-title" className="text-lg font-semibold text-foreground">Tus conexiones</h2>
        <Suspense fallback={null}>
          <ConnectorsGrid statuses={statuses} />
        </Suspense>
      </section>

      <AdAccountsShortcut clients={clients} />
    </div>
  )
}
