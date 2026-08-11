import pg from 'pg'
const { Client } = pg
const client = new Client({ connectionString: process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL })
await client.connect()

const res = await client.query(`
  select au.id as auth_id, au.email as auth_email, c.id as colab_id, c.email as colab_email, c.nombre
  from auth.users au
  full outer join public.colaboradores c on lower(trim(au.email)) = lower(trim(c.email))
  order by c.nombre
`)
console.log(JSON.stringify(res.rows, null, 2))

await client.end()
