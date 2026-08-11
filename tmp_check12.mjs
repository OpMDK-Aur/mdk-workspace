import pg from 'pg'
const { Client } = pg
const client = new Client({ connectionString: process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL })
await client.connect()

const grants = await client.query(`
  select grantee, privilege_type
  from information_schema.role_table_grants
  where table_name = 'notificaciones'
  order by grantee, privilege_type
`)
console.log('Grants:', JSON.stringify(grants.rows, null, 2))

await client.end()
