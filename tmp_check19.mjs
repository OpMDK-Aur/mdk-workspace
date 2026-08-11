import { createClient } from '@supabase/supabase-js'

const base = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Fresh magic link + OTP verify for Erika, done right here to avoid stale tokens
const linkRes = await fetch(`${base}/auth/v1/admin/generate_link`, {
  method: 'POST',
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'magiclink', email: 'erika@soyaurelia.com' }),
})
const linkData = await linkRes.json()

const verifyRes = await fetch(`${base}/auth/v1/verify`, {
  method: 'POST',
  headers: { apikey: anon, 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'email', email: 'erika@soyaurelia.com', token: linkData.email_otp }),
})
const session = await verifyRes.json()
console.log('Got Erika session for user:', session.user?.email)

const supabase = createClient(base, anon)
const { error: sessErr } = await supabase.auth.setSession({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
})
if (sessErr) {
  console.error('setSession error', sessErr)
  process.exit(1)
}

let received = false

const channel = supabase
  .channel('test_notificaciones_count_2')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'notificaciones' }, (payload) => {
    console.log('REALTIME EVENT RECEIVED:', payload.eventType, JSON.stringify(payload.new || payload.old))
    received = true
  })
  .subscribe((status, err) => {
    console.log('Subscription status:', status, err ? String(err) : '')
  })

await new Promise((r) => setTimeout(r, 3000))

const insertRes = await fetch(`${base}/rest/v1/notificaciones`, {
  method: 'POST',
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  },
  body: JSON.stringify({
    colaborador_id: 'b9bc1549-a988-4ed1-b9af-a91ba611a7cf',
    tipo: 'mencion',
    titulo: 'TEST REALTIME 2 - Fernando te mencionó',
    descripcion: 'Prueba de entrega en tiempo real (correcta)',
    leida: false,
  }),
})
console.log('Insert status:', insertRes.status)

await new Promise((r) => setTimeout(r, 8000))

console.log('Event received within timeout?', received)

await supabase.removeChannel(channel)
process.exit(0)
