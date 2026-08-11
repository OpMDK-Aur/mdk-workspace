import { createClient } from '@supabase/supabase-js'

const base = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const erikaAccessToken = process.argv[2]
const erikaRefreshToken = process.argv[3]

const supabase = createClient(base, anon)

const { error: sessErr } = await supabase.auth.setSession({
  access_token: erikaAccessToken,
  refresh_token: erikaRefreshToken,
})
if (sessErr) {
  console.error('setSession error', sessErr)
  process.exit(1)
}

let received = false

const channel = supabase
  .channel('test_notificaciones_count')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'notificaciones' }, (payload) => {
    console.log('REALTIME EVENT RECEIVED:', JSON.stringify(payload.eventType), JSON.stringify(payload.new || payload.old))
    received = true
  })
  .subscribe((status) => {
    console.log('Subscription status:', status)
  })

// Wait for subscription to establish
await new Promise((r) => setTimeout(r, 3000))

// Now insert a mention notification for Erika using service role (simulating Fernando's insert)
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
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
    titulo: 'TEST REALTIME - Fernando te mencionó',
    descripcion: 'Prueba de entrega en tiempo real',
    leida: false,
  }),
})
console.log('Insert status:', insertRes.status)

// Wait up to 8s for the realtime event
await new Promise((r) => setTimeout(r, 8000))

console.log('Event received within timeout?', received)

await supabase.removeChannel(channel)
process.exit(0)
