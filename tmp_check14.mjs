import jwt from 'jsonwebtoken'

const secret = process.env.SUPABASE_JWT_SECRET
const fernandoAuthId = '37f9f4ef-5c12-4f61-8721-11cdb74c9f59'
const erikaId = 'b9bc1549-a988-4ed1-b9af-a91ba611a7cf'

const token = jwt.sign(
  {
    sub: fernandoAuthId,
    email: 'fmarin@madketing.io',
    role: 'authenticated',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 60,
  },
  secret
)

const base = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const insertRes = await fetch(`${base}/rest/v1/notificaciones`, {
  method: 'POST',
  headers: {
    apikey: anon,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    // NO Prefer header at all - default PostgREST behavior
  },
  body: JSON.stringify({
    colaborador_id: erikaId,
    tipo: 'mencion',
    titulo: 'Fernando Marin te mencionó en un comentario (TEST3-noPrefer)',
    descripcion: 'Test sin header Prefer',
    leida: false,
  }),
})
console.log('Insert status:', insertRes.status)
console.log('Insert body:', await insertRes.text())
