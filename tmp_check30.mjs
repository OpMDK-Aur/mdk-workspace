import pg from 'pg'
import jwt from 'jsonwebtoken'
const { Client } = pg

// Build the exact same JWT PostgREST would receive from Supabase auth for Fernando
const secret = process.env.SUPABASE_JWT_SECRET
const token = jwt.sign(
  {
    sub: '37f9f4ef-5c12-4f61-8721-11cdb74c9f59',
    role: 'authenticated',
    email: 'fmarin@madketing.io',
    aud: 'authenticated',
  },
  secret,
  { expiresIn: '1h' }
)
const decoded = jwt.decode(token)
console.log('Decoded JWT:', JSON.stringify(decoded))

const client = new Client({ connectionString: process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL })
await client.connect()

// This is EXACTLY how PostgREST sets the request context per docs
await client.query('BEGIN')
await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(decoded)])
await client.query(`set local role authenticated`)

const uidCheck = await client.query(`select auth.uid() as uid, auth.role() as role, auth.jwt() as jwt`)
console.log('Inside tx - auth.uid/role/jwt:', JSON.stringify(uidCheck.rows))

try {
  const ins = await client.query(`
    insert into public.notificaciones (colaborador_id, tipo, titulo, descripcion, leida)
    values ('b9bc1549-a988-4ed1-b9af-a91ba611a7cf', 'mencion', 'TEST detailed error', 'test', false)
    returning id
  `)
  console.log('Insert succeeded:', ins.rows)
} catch (e) {
  console.log('Insert failed. Full error object:', JSON.stringify(e, Object.getOwnPropertyNames(e)))
}

await client.query('ROLLBACK')
await client.end()
