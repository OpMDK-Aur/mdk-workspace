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
const { data: verifyData, error: verifyError } = await anon.auth.verifyOtp({
  type: 'magiclink',
  token_hash: linkData.properties.hashed_token,
})
if (verifyError) { console.log('Verify error:', verifyError.message); process.exit(1) }

console.log('Signed in as Fernando auth.uid:', verifyData.user.id)

// Find Fernando's colaborador.id
const { data: fernandoColab } = await admin.from('colaboradores').select('id, email').eq('email', 'fmarin@madketing.io').single()
console.log('Fernando colaborador.id:', fernandoColab?.id, '(differs from auth.uid?', fernandoColab?.id !== verifyData.user.id, ')')

// Test 1: insert for self using auth.uid()
const r1 = await anon.from('notificaciones').insert({
  colaborador_id: verifyData.user.id,
  tipo: 'mencion', titulo: 'TEST self via auth.uid', descripcion: 'test', leida: false,
}).select()
console.log('Insert for self (auth.uid):', JSON.stringify({ data: r1.data, error: r1.error }))

// Test 2: insert for self using colaboradores.id (if different)
if (fernandoColab && fernandoColab.id !== verifyData.user.id) {
  const r2 = await anon.from('notificaciones').insert({
    colaborador_id: fernandoColab.id,
    tipo: 'mencion', titulo: 'TEST self via colaboradores.id', descripcion: 'test', leida: false,
  }).select()
  console.log('Insert for self (colaboradores.id):', JSON.stringify({ data: r2.data, error: r2.error }))
}

// Test 3: insert for another user (Erika)
const r3 = await anon.from('notificaciones').insert({
  colaborador_id: 'b9bc1549-a988-4ed1-b9af-a91ba611a7cf',
  tipo: 'mencion', titulo: 'TEST cross-user', descripcion: 'test', leida: false,
}).select()
console.log('Insert cross-user (Erika):', JSON.stringify({ data: r3.data, error: r3.error }))
