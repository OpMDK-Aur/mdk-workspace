import pg from 'pg'
const { Client } = pg
const client = new Client({ connectionString: process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL })
await client.connect()

// Set the JWT claims the way supabase-js/PostgREST actually sets them: as 'request.jwt.claims' GUC,
// AND set role to authenticated. But also check 'role' claim itself.
await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, ['37f9f4ef-5c12-4f61-8721-11cdb74c9f59'])
await client.query(`select set_config('request.jwt.claims', $1, true)`, [
  JSON.stringify({ sub: '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', role: 'authenticated', email: 'fmarin@madketing.io', aud: 'authenticated' })
])
await client.query(`set role authenticated`)

const ctxCheck = await client.query(`select current_setting('request.jwt.claims', true) as claims, current_user, session_user`)
console.log('Context:', JSON.stringify(ctxCheck.rows))

const uidCheck = await client.query(`select auth.uid() as uid, auth.role() as role`)
console.log('auth.uid/role:', JSON.stringify(uidCheck.rows))

try {
  const ins = await client.query(`
    explain (analyze, verbose) insert into public.notificaciones (colaborador_id, tipo, titulo, descripcion, leida)
    values ('b9bc1549-a988-4ed1-b9af-a91ba611a7cf', 'mencion', 'TEST explain', 'test', false)
  `)
  console.log('EXPLAIN result:', ins.rows.map(r => r['QUERY PLAN']).join('\n'))
} catch (e) {
  console.log('EXPLAIN failed:', e.message)
}

await client.query(`reset role`)
await client.end()
