import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Sign in as Fernando (the "author" who will mention someone else)
const supabase = createClient(url, anonKey)

const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
  email: 'fmarin@madketing.io',
  password: process.env.TEST_PASSWORD || '',
})

if (signInError) {
  console.log('Sign in error (expected if no password known):', signInError.message)
  console.log('Falling back to service-role lookup + manual JWT approach not needed; aborting this script.')
  process.exit(0)
}

console.log('Signed in as:', signInData.user.email)

// Try inserting a notification for ANOTHER user (Erika), simulating a mention
const { data, error } = await supabase
  .from('notificaciones')
  .insert({
    colaborador_id: 'b9bc1549-a988-4ed1-b9af-a91ba611a7cf', // Erika's colaborador id (auth-based test)
    tipo: 'mencion',
    titulo: 'TEST cross-user mention insert',
    descripcion: 'test',
    leida: false,
  })
  .select()

console.log('Insert result:', JSON.stringify({ data, error }, null, 2))
