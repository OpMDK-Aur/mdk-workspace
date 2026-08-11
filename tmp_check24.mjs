import pg from 'pg'
const { Client } = pg
const client = new Client({ connectionString: process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL })
await client.connect()

const cols = await client.query(`
  select column_name, is_nullable, column_default, data_type
  from information_schema.columns
  where table_name = 'notificaciones' and table_schema = 'public'
  order by ordinal_position
`)
console.log('Columns:', JSON.stringify(cols.rows, null, 2))

// Check RLS as Fernando's role using SET ROLE simulation via set_config
await client.query(`select set_config('request.jwt.claims', $1, true)`, [
  JSON.stringify({ sub: '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', role: 'authenticated', email: 'fmarin@madketing.io' })
])
await client.query(`set role authenticated`)

try {
  const testInsert = await client.query(`
    insert into public.notificaciones (colaborador_id, tipo, titulo, descripcion, leida)
    values ('b9bc1549-a988-4ed1-b9af-a91ba611a7cf', 'mencion', 'TEST via SET ROLE', 'test', false)
    returning id
  `)
  console.log('SET ROLE insert succeeded:', testInsert.rows)
} catch (e) {
  console.log('SET ROLE insert failed:', e.message, e.code)
}

await client.query(`reset role`)
await client.end()
