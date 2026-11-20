import 'server-only'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Sesión + acceso al cliente. El acceso se valida con el cliente de Supabase
 * del usuario (RLS de `clientes`), así nadie lee transcripciones de un cliente
 * que no puede ver. Devuelve una respuesta de error lista para retornar.
 */
export async function requireClientAccess(clientId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) } as const
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return { error: NextResponse.json({ error: 'Cliente inválido.' }, { status: 400 }) } as const
  const { data: client } = await supabase.from('clientes').select('id, nombre_del_negocio').eq('id', clientId).maybeSingle()
  if (!client) return { error: NextResponse.json({ error: 'El cliente no existe o no tenés acceso.' }, { status: 404 }) } as const
  return { user, client } as const
}

/** Errores conocidos de la base cuando todavía no se corrió el SQL de transcripciones. */
export function isMissingTableError(error: { code?: string } | null | undefined) {
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

export const MISSING_TABLE_MESSAGE = 'Falta crear la tabla de transcripciones en la base (scripts/sql/2026-11-20-transcripciones-clientes.sql).'
