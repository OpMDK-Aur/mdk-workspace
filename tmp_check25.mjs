import pg from 'pg'
const { Client } = pg
const client = new Client({ connectionString: process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL })
await client.connect()

await client.query(`select set_config('request.jwt.claims', $1, true)`, [
  JSON.stringify({ sub: '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', role: 'authenticated', email: 'fmarin@madketing.io' })
])
await client.query(`set role authenticated`)

const uid = await client.query(`select auth.uid() as uid`)
console.log('auth.uid():', JSON.stringify(uid.rows))

// Check what RLS policies actually apply for INSERT on this role
const applicable = await client.query(`
  select polname, polcmd, polroles::regrole[] as roles, pg_get_expr(polwithcheck, polrelid) as with_check
  from pg_policy
  where polrelid = 'public.notificaciones'::regclass and polcmd in ('a', '*')
`)
console.log('Applicable INSERT policies (raw pg_policy):', JSON.stringify(applicable.rows, null, 2))

await client.query(`reset role`)
await client.end()
