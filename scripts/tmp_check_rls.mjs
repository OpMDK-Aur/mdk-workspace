import pg from 'pg'
const { Client } = pg
const client = new Client({ connectionString: process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } })
await client.connect()

const rls = await client.query(`
  select relname, relrowsecurity, relforcerowsecurity
  from pg_class
  where relname = 'notificaciones'
`)
console.log('RLS status:', JSON.stringify(rls.rows, null, 2))

const policies = await client.query(`
  select policyname, cmd, roles, qual, with_check
  from pg_policies
  where tablename = 'notificaciones'
  order by cmd
`)
console.log('Policies:', JSON.stringify(policies.rows, null, 2))

// Check colaboradores table structure and relation to auth.users
const colabCols = await client.query(`
  select column_name, data_type
  from information_schema.columns
  where table_name = 'colaboradores' and table_schema = 'public'
  order by ordinal_position
`)
console.log('colaboradores columns:', JSON.stringify(colabCols.rows, null, 2))

await client.end()
