import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const admin = createClient(url, serviceKey)
const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email: 'fmarin@madketing.io',
})
if (linkError) { console.log('Link error:', linkError.message); process.exit(1) }

const anon = createClient(url, anonKey)
const { error: verifyError } = await anon.auth.verifyOtp({
  type: 'magiclink',
  token_hash: linkData.properties.hashed_token,
})
if (verifyError) { console.log('Verify error:', verifyError.message); process.exit(1) }

// EXACT same shape as client-comments.tsx: insert(notifications) array, NO .select()
const notifications = [{
  colaborador_id: 'b9bc1549-a988-4ed1-b9af-a91ba611a7cf', // Erika
  tipo: 'mencion',
  titulo: 'Fernando Marin te mencionó en un comentario',
  descripcion: 'Prueba exacta del flujo real de la app',
  referencia_id: null,
  referencia_tipo: 'comentario_cliente',
  cliente_id: 'test-client-id',
  leida: false,
}]

const { error: notifError } = await anon.from('notificaciones').insert(notifications)
console.log('Result (matching real app code, no .select()):', JSON.stringify({ error: notifError }))
