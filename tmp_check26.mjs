import pg from 'pg'
const { Client } = pg
const client = new Client({ connectionString: process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL })
await client.connect()

const perm = await client.query(`
  select polname, polpermissive, polcmd
  from pg_policy
  where polrelid = 'public.notificaciones'::regclass
`)
console.log('Permissive flags:', JSON.stringify(perm.rows, null, 2))

await client.end()
