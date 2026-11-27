import { getConnectorCredentials } from '@/lib/connectors/credentials'

export const USER_CLAUDE_MODEL = 'anthropic/claude-sonnet-5'

export type UserClaude = {
  model: string
  providerOptions: { gateway: { byok: { anthropic: Array<{ apiKey: string }> }; only: string[] } }
}

/**
 * Devuelve la configuración para que el AI Gateway use la API key de Anthropic
 * que el colaborador conectó (BYOK por request), o null si no conectó ninguna.
 * `only` evita que el Gateway sirva el modelo por Bedrock/Vertex, donde la clave no aplica.
 */
export async function getUserClaude(userId: string | null | undefined, model = USER_CLAUDE_MODEL): Promise<UserClaude | null> {
  if (!userId) return null
  const credentials = await getConnectorCredentials(userId, 'anthropic').catch(() => null)
  const apiKey = credentials?.apiKey?.trim()
  if (!apiKey) return null
  return { model, providerOptions: { gateway: { byok: { anthropic: [{ apiKey }] }, only: ['anthropic'] } } }
}
