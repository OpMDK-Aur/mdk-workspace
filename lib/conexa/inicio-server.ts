import 'server-only'
import type { User } from '@supabase/supabase-js'
import type { createClient as createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

/** Colaborador de la sesión (por email) o, si no existe, el id del usuario de auth. */
export async function resolveColaborador(admin: Admin, user: User) {
  const { data } = user.email
    ? await admin.from('colaboradores').select('id, nombre').eq('email', user.email).maybeSingle()
    : { data: null }
  return { id: (data?.id as string | undefined) ?? user.id, nombre: (data?.nombre as string | undefined) ?? null }
}

/** Clientes donde la persona es project manager, account manager o uno de los account managers. */
export function myClientsFilter(me: string) {
  return `project_manager_id.eq.${me},account_manager_id.eq.${me},account_manager_ids.cs.{${me}}`
}
