import pg from 'pg'
import jwt from 'jsonwebtoken'

const { Client } = pg
const client = new Client({ connectionString: process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL })
await client.connect()

// Fernando Marin mentions Erika Gordillo
const fernandoId = '37f9f4ef-5c12-4f61-8721-11cdb74c9f59'
const erikaId = 'b9bc1549-a988-4ed1-b9af-a91ba611a7cf'

const { rows: fernandoAuth } = await client.query(
  `select au.id, au.email from auth.users au join colaboradores c on lower(trim(au.email))=lower(trim(c.email)) where c.id = $1`,
  [fernandoId]
)
console.log('Fernando auth row:', fernandoAuth)

await client.end()

const secret = process.env.SUPABASE_JWT_SECRET
const token = jwt.sign(
  {
    sub: fernandoAuth[0].id,
    email: fernandoAuth[0].email,
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
    Prefer: 'return=representation',
  },
  body: JSON.stringify({
    colaborador_id: erikaId,
    tipo: 'mencion',
    titulo: 'Fernando Marin te mencionó en un comentario (TEST)',
    descripcion: 'Test de diagnóstico',
    leida: false,
  }),
})
console.log('Insert status:', insertRes.status)
console.log('Insert body:', await insertRes.text())
