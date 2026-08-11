import pg from 'pg'
const { Client } = pg
const client = new Client({ connectionString: process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL })
await client.connect()
await client.query(`NOTIFY pgrst, 'reload schema'`)
console.log('Sent reload schema notification')
await client.end()
