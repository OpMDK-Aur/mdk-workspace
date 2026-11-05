import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { parseDashboardBudget } from '@/lib/conexa/dashboard-budget'

export const runtime = 'nodejs'

const BUCKET = 'conexa-presupuestos'
const MAX_FILE_SIZE = 5 * 1024 * 1024
const CLIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function authorizeClient(clientId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'No autorizado.' }, { status: 401 }) }

  const { data: client, error } = await supabase
    .from('clientes')
    .select('id')
    .eq('id', clientId)
    .maybeSingle()

  if (error || !client) return { response: NextResponse.json({ error: 'No tienes acceso a este cliente.' }, { status: 403 }) }
  return { admin: createAdminClient() }
}

const folderFor = (clientId: string) => `dashboard-presupuestos/${clientId}`
const pathFor = (clientId: string, extension: 'csv' | 'xlsx') => `${folderFor(clientId)}/presupuesto.${extension}`

function isMissingObject(error: { message?: string; statusCode?: string | number } | null) {
  const message = String(error?.message ?? '').toLowerCase()
  return String(error?.statusCode ?? '') === '404' || message.includes('not found') || message.includes('object does not exist')
}

function storageUnavailable(error: { message?: string } | null) {
  return String(error?.message ?? '').toLowerCase().includes('bucket not found')
}

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId') ?? ''
  if (!CLIENT_ID.test(clientId)) return NextResponse.json({ error: 'Falta un ID de cliente válido.' }, { status: 400 })

  const access = await authorizeClient(clientId)
  if ('response' in access) return access.response

  const storage = access.admin.storage.from(BUCKET)
  const { data: objects, error: listError } = await storage.list(folderFor(clientId), { limit: 10, search: 'presupuesto' })
  if (listError) {
    const status = storageUnavailable(listError) ? 503 : 500
    return NextResponse.json({ configured: false, error: status === 503 ? 'El bucket de presupuesto aún no está disponible.' : 'No se pudo consultar el archivo de presupuesto.' }, { status })
  }

  const current = (objects ?? [])
    .filter((object) => object.name === 'presupuesto.xlsx' || object.name === 'presupuesto.csv')
    .sort((left, right) => String(right.updated_at ?? right.created_at ?? '').localeCompare(String(left.updated_at ?? left.created_at ?? '')))[0]

  if (!current) return NextResponse.json({ configured: false, fileName: null, sheets: {}, rowCounts: {} })

  const extension = current.name.endsWith('.xlsx') ? 'xlsx' : 'csv'
  const { data: file, error: downloadError } = await storage.download(pathFor(clientId, extension))
  if (downloadError || !file) {
    const status = storageUnavailable(downloadError) ? 503 : 500
    return NextResponse.json({ configured: false, error: status === 503 ? 'El bucket de presupuesto aún no está disponible.' : 'No se pudo leer el archivo de presupuesto.' }, { status })
  }

  try {
    const parsed = parseDashboardBudget(Buffer.from(await file.arrayBuffer()), current.name, file.type)
    const { data: publicData } = storage.getPublicUrl(pathFor(clientId, extension))
    return NextResponse.json({
      configured: true,
      ...parsed,
      publicUrl: publicData.publicUrl,
      updatedAt: current.updated_at ?? current.created_at ?? null,
    })
  } catch (cause) {
    console.error('[conexa-dashboard] No se pudo interpretar el presupuesto:', cause)
    return NextResponse.json({ configured: true, error: 'El archivo guardado no tiene un formato de presupuesto válido.' }, { status: 422 })
  }
}

export async function POST(request: NextRequest) {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el formulario de carga.' }, { status: 400 })
  }

  const clientId = String(formData.get('clientId') ?? '')
  const file = formData.get('file')
  if (!CLIENT_ID.test(clientId)) return NextResponse.json({ error: 'Falta un ID de cliente válido.' }, { status: 400 })
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Seleccioná un archivo CSV o XLSX.' }, { status: 400 })
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'El archivo supera el límite de 5 MB.' }, { status: 413 })

  const extension = file.name.toLowerCase().split('.').pop()
  if (extension !== 'csv' && extension !== 'xlsx') return NextResponse.json({ error: 'El archivo debe tener formato CSV o XLSX.' }, { status: 415 })

  let parsed
  try {
    parsed = parseDashboardBudget(Buffer.from(await file.arrayBuffer()), file.name, file.type)
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'El archivo no tiene un formato de presupuesto válido.' }, { status: 422 })
  }

  const access = await authorizeClient(clientId)
  if ('response' in access) return access.response

  const storage = access.admin.storage.from(BUCKET)
  const currentPath = pathFor(clientId, extension)
  const contentType = file.type || (extension === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  const { error: uploadError } = await storage.upload(currentPath, file, {
    cacheControl: '0',
    contentType,
    upsert: true,
  })

  if (uploadError) {
    const status = storageUnavailable(uploadError) ? 503 : 500
    return NextResponse.json({ error: status === 503 ? 'El bucket de presupuesto aún no está disponible.' : 'No se pudo guardar el archivo.' }, { status })
  }

  const previousExtension = extension === 'csv' ? 'xlsx' : 'csv'
  await storage.remove([pathFor(clientId, previousExtension)]).catch(() => {})
  const { data: publicData } = storage.getPublicUrl(currentPath)
  const { data: objects } = await storage.list(folderFor(clientId), { limit: 10, search: 'presupuesto' })
  const stored = objects?.find((object) => object.name === `presupuesto.${extension}`)

  return NextResponse.json({
    configured: true,
    ...parsed,
    publicUrl: publicData.publicUrl,
    updatedAt: stored?.updated_at ?? new Date().toISOString(),
  })
}
