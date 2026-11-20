import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { CONNECTOR_BY_ID, type ConnectorId } from './catalog'
import { decryptCredentials } from './secrets'

/**
 * Credenciales descifradas que un usuario guardó para un conector de tipo
 * `credentials` (GoHighLevel, Kommo, Cloudflare, etc.). Solo para uso en el servidor.
 */
export async function getConnectorCredentials(userId: string, id: ConnectorId): Promise<Record<string, string> | null> {
  const platform = CONNECTOR_BY_ID[id]?.platform
  if (!platform) return null
  const { data } = await createAdminClient()
    .from('plataformas_tokens')
    .select('access_token')
    .eq('plataforma', platform)
    .eq('cliente_id', userId)
    .eq('activo', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data?.access_token) return null
  try {
    return decryptCredentials(data.access_token)
  } catch (error) {
    console.error(`[connectors] No se pudieron descifrar las credenciales de ${id}:`, error instanceof Error ? error.message : error)
    return null
  }
}
