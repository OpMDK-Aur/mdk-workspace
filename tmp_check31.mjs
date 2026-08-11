import pg from 'pg'
import jwt from 'jsonwebtoken'
const { Client } = pg

const secret = process.env.SUPABASE_JWT_SECRET
const token = jwt.sign(
  { sub: '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', role: 'authenticated', email: 'fmarin@madketing.io', aud: 'authenticated' },
  secret, { expiresIn: '1h' }
)
const decoded = jwt.decode(token)

const client = new Client({ connectionString: process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL })
await client.connect()

await client.query('BEGIN')
await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(decoded)])
await client.query(`set local role authenticated`)

try {
  // No RETURNING clause this time
  const ins = await client.query(`
    insert into public.notificaciones (colaborador_id, tipo, titulo, descripcion, leida)
    values ('b9bc1549-a988-4ed1-b9af-a91ba611a7cf', 'mencion', 'TEST no returning', 'test', false)
  `)
  console.log('Insert (no RETURNING) succeeded, rowCount:', ins.rowCount)
} catch (e) {
  console.log('Insert (no RETURNING) failed:', e.message, e.code)
}

await client.query('ROLLBACK')
await client.end()
