import pg from 'pg'
const { Client } = pg
const client = new Client({ connectionString: process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL })
await client.connect()

const triggers = await client.query(`
  select tgname, tgtype, pg_get_triggerdef(oid) as def
  from pg_trigger
  where tgrelid = 'public.notificaciones'::regclass and not tgisinternal
`)
console.log('Triggers:', JSON.stringify(triggers.rows, null, 2))

const forceRls = await client.query(`
  select relname, relrowsecurity, relforcerowsecurity
  from pg_class where relname = 'notificaciones'
`)
console.log('RLS flags:', JSON.stringify(forceRls.rows, null, 2))

// check role membership - is 'public' role actually effective for authenticated users?
const roleCheck = await client.query(`
  select rolname, rolinherit from pg_roles where rolname in ('authenticated','anon','public')
`)
console.log('Roles:', JSON.stringify(roleCheck.rows, null, 2))

await client.end()
