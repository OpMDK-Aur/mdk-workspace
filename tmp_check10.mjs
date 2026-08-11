import pg from 'pg'
const { Client } = pg
const client = new Client({ connectionString: process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL })
await client.connect()

const policies = await client.query(`
  select policyname, cmd, permissive, roles, qual, with_check
  from pg_policies
  where tablename = 'notificaciones'
  order by cmd, policyname
`)
console.log('Policies:', JSON.stringify(policies.rows, null, 2))

await client.end()
