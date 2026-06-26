'use server'

import { createClient as createSupabaseClient } from '@/lib/supabase/server'

/**
 * Actualiza automáticamente el Account Manager de todos los hitos relacionados a un cliente
 * cuando el Account Manager del cliente cambia
 */
export async function updateClientHitosAccountManager(
  clientId: string,
  newAccountManagerId: string | null
) {
  try {
    const supabase = await createSupabaseClient()

    // Obtener todos los hitos relacionados al cliente
    const { data: tareas, error: getTareasError } = await supabase
      .from('tareas')
      .select('id, titulo, account_manager_ids')
      .contains('cliente_ids', [clientId])
      .ilike('titulo', '%[Hito]%')

    if (getTareasError) {
      console.error('[v0] Error fetching client tasks:', getTareasError)
      throw getTareasError
    }

    if (!tareas || tareas.length === 0) {
      console.log('[v0] No hitos found for client:', clientId)
      return { success: true, updated: 0 }
    }

    // Actualizar cada hito con el nuevo Account Manager
    const updates = tareas.map((tarea: any) => {
      // Construir el nuevo array de account managers
      let newAccountManagerIds = tarea.account_manager_ids || []
      
      // Si hay un nuevo account manager, agregarlo
      if (newAccountManagerId && !newAccountManagerIds.includes(newAccountManagerId)) {
        newAccountManagerIds = [newAccountManagerId, ...newAccountManagerIds.filter((id: string) => id !== newAccountManagerId)]
      }
      
      return {
        id: tarea.id,
        account_manager_ids: newAccountManagerIds,
      }
    })

    // Ejecutar los updates
    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('tareas')
        .update({ account_manager_ids: update.account_manager_ids })
        .eq('id', update.id)

      if (updateError) {
        console.error('[v0] Error updating tarea:', update.id, updateError)
        throw updateError
      }
    }

    console.log('[v0] Successfully updated', tareas.length, 'hitos for client:', clientId)
    return { success: true, updated: tareas.length }
  } catch (error) {
    console.error('[v0] Error in updateClientHitosAccountManager:', error)
    throw error
  }
}
