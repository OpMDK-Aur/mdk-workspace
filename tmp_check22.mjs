import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const admin = createClient(url, serviceKey)

// Generate a magiclink for Fernando and extract the token hash to verify it as a real session
const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email: 'fmarin@madketing.io',
})

if (linkError) {
  console.log('Link error:', linkError.message)
  process.exit(1)
}

const hashedToken = linkData.properties.hashed_token
console.log('Got hashed token for Fernando')

const anon = createClient(url, anonKey)
const { data: verifyData, error: verifyError } = await anon.auth.verifyOtp({
  type: 'magiclink',
  token_hash: hashedToken,
})

if (verifyError) {
  console.log('Verify error:', verifyError.message)
  process.exit(1)
}

console.log('Signed in as Fernando:', verifyData.user.email, verifyData.user.id)

// Now, AS FERNANDO, try inserting a notification for ANOTHER user (Erika), simulating a mention
const { data, error } = await anon
  .from('notificaciones')
  .insert({
    colaborador_id: 'b9bc1549-a988-4ed1-b9af-a91ba611a7cf', // Erika's id
    tipo: 'mencion',
    titulo: 'TEST cross-user mention insert (Fernando -> Erika)',
    descripcion: 'test real flow',
    leida: false,
  })
  .select()

console.log('Cross-user insert result:', JSON.stringify({ data, error }, null, 2))
