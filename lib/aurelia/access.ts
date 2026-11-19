import { createClient } from '@/lib/supabase/server'
import { resolveUnitAccess } from '@/lib/business-units'

export type AureliaViewer = { userId: string; canAccess: boolean }

/** Usuario de la sesión y si pertenece a Aurelia (o es Master). */
export async function getAureliaViewer(): Promise<AureliaViewer | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: colaborador } = await supabase
    .from('colaboradores')
    .select('*, roles(nombre)')
    .eq('id', user.id)
    .maybeSingle()
  const access = resolveUnitAccess((colaborador?.roles as { nombre?: string } | null)?.nombre, colaborador?.unidades_negocio)
  return { userId: user.id, canAccess: access.aurelia }
}
