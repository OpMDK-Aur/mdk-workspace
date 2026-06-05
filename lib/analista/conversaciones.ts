import { createClient } from '@/lib/supabase/client'

export type AnalistaConversacion = {
  id: string
  usuario_id: string
  cliente_id: string | null
  titulo: string
  periodo_mes: number | null
  periodo_anio: number | null
  created_at: string
  updated_at: string
}

export type AnalistaMensaje = {
  id: string
  conversacion_id: string
  usuario_id: string
  rol: 'user' | 'assistant'
  contenido: string
  created_at: string
}

// List the current user's conversations (most recent first)
export async function listConversaciones(): Promise<AnalistaConversacion[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('analista_conversaciones')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(50)
  if (error) {
    console.error('[v0] listConversaciones error:', error.message)
    return []
  }
  return (data || []) as AnalistaConversacion[]
}

// Create a new conversation for the current user
export async function createConversacion(params: {
  clienteId: string | null
  titulo?: string
  mes?: number | null
  anio?: number | null
}): Promise<AnalistaConversacion | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('analista_conversaciones')
    .insert({
      usuario_id: user.id,
      cliente_id: params.clienteId,
      titulo: params.titulo || 'Nueva conversación',
      periodo_mes: params.mes ?? null,
      periodo_anio: params.anio ?? null,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[v0] createConversacion error:', error.message)
    return null
  }
  return data as AnalistaConversacion
}

// Load all messages for a conversation (chronological)
export async function loadMensajes(conversacionId: string): Promise<AnalistaMensaje[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('analista_mensajes')
    .select('*')
    .eq('conversacion_id', conversacionId)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[v0] loadMensajes error:', error.message)
    return []
  }
  return (data || []) as AnalistaMensaje[]
}

// Persist a single message
export async function saveMensaje(params: {
  conversacionId: string
  rol: 'user' | 'assistant'
  contenido: string
}): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase.from('analista_mensajes').insert({
    conversacion_id: params.conversacionId,
    usuario_id: user.id,
    rol: params.rol,
    contenido: params.contenido,
  })
  if (error) console.error('[v0] saveMensaje error:', error.message)
}

// Rename a conversation
export async function renameConversacion(conversacionId: string, titulo: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('analista_conversaciones')
    .update({ titulo })
    .eq('id', conversacionId)
  if (error) console.error('[v0] renameConversacion error:', error.message)
}

// Delete a conversation (messages cascade)
export async function deleteConversacion(conversacionId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('analista_conversaciones')
    .delete()
    .eq('id', conversacionId)
  if (error) console.error('[v0] deleteConversacion error:', error.message)
}
