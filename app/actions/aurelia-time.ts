'use server'

import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { getAureliaViewer } from '@/lib/aurelia/access'
import { AURELIA_TIME_TABLE, todayInArgentina } from '@/lib/aurelia/time'

type Result = { error: string | null }

const MAX_DESCRIPTION = 500
const MAX_MANUAL_MINUTES = 24 * 60

async function requireViewer() {
  const viewer = await getAureliaViewer()
  if (!viewer) throw new Error('Tu sesión expiró. Volvé a iniciar sesión.')
  if (!viewer.canAccess) throw new Error('No tenés acceso a Aurelia.')
  return viewer
}

const cleanText = (value: string | null | undefined, max: number) => {
  const text = String(value ?? '').trim().slice(0, max)
  return text || null
}

function validateClient(clientId: string) {
  const id = String(clientId ?? '').trim()
  if (!id || id.length > 100) throw new Error('Cliente inválido.')
  return id
}

async function run(action: () => Promise<void>): Promise<Result> {
  try {
    await action()
    return { error: null }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudo guardar.' }
  }
}

async function stopRunning(userId: string) {
  const admin = createAdminClient()
  const { data: running, error } = await admin.from(AURELIA_TIME_TABLE).select('id,iniciado_en').eq('colaborador_id', userId).is('finalizado_en', null).maybeSingle()
  if (error) throw new Error(error.message)
  if (!running) return
  const finishedAt = new Date()
  const seconds = Math.max(0, Math.round((finishedAt.getTime() - new Date(running.iniciado_en).getTime()) / 1000))
  const { error: updateError } = await admin.from(AURELIA_TIME_TABLE).update({ finalizado_en: finishedAt.toISOString(), duracion_seg: seconds }).eq('id', running.id).eq('colaborador_id', userId)
  if (updateError) throw new Error(updateError.message)
}

/** Arranca un timer sobre un cliente; si había otro corriendo, lo cierra primero. */
export async function startAureliaTimer(input: { clientId: string; clientName: string; descripcion?: string }): Promise<Result> {
  return run(async () => {
    const viewer = await requireViewer()
    const clientId = validateClient(input.clientId)
    await stopRunning(viewer.userId)
    const { error } = await createAdminClient().from(AURELIA_TIME_TABLE).insert({
      colaborador_id: viewer.userId,
      aurelia_client_id: clientId,
      aurelia_client_name: cleanText(input.clientName, 200),
      descripcion: cleanText(input.descripcion, MAX_DESCRIPTION),
      fecha: todayInArgentina(),
      iniciado_en: new Date().toISOString(),
    })
    if (error) throw new Error(error.message)
  })
}

export async function stopAureliaTimer(): Promise<Result> {
  return run(async () => {
    const viewer = await requireViewer()
    await stopRunning(viewer.userId)
  })
}

export async function addAureliaTimeEntry(input: { clientId: string; clientName: string; fecha: string; minutes: number; descripcion?: string }): Promise<Result> {
  return run(async () => {
    const viewer = await requireViewer()
    const clientId = validateClient(input.clientId)
    const minutes = Math.round(Number(input.minutes))
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > MAX_MANUAL_MINUTES) throw new Error('La duración tiene que estar entre 1 minuto y 24 horas.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha) || Number.isNaN(new Date(`${input.fecha}T12:00:00-03:00`).getTime())) throw new Error('Fecha inválida.')
    if (input.fecha > todayInArgentina()) throw new Error('No se pueden cargar horas a futuro.')
    const startedAt = new Date(`${input.fecha}T09:00:00-03:00`)
    const { error } = await createAdminClient().from(AURELIA_TIME_TABLE).insert({
      colaborador_id: viewer.userId,
      aurelia_client_id: clientId,
      aurelia_client_name: cleanText(input.clientName, 200),
      descripcion: cleanText(input.descripcion, MAX_DESCRIPTION),
      fecha: input.fecha,
      iniciado_en: startedAt.toISOString(),
      finalizado_en: new Date(startedAt.getTime() + minutes * 60_000).toISOString(),
      duracion_seg: minutes * 60,
    })
    if (error) throw new Error(error.message)
  })
}

/** Cada colaborador solo puede borrar sus propias entradas. */
export async function deleteAureliaTimeEntry(entryId: string): Promise<Result> {
  return run(async () => {
    const viewer = await requireViewer()
    const { error } = await createAdminClient().from(AURELIA_TIME_TABLE).delete().eq('id', entryId).eq('colaborador_id', viewer.userId)
    if (error) throw new Error(error.message)
  })
}
