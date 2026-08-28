import fs from 'node:fs'
import pg from 'pg'

const { Client } = pg

const filePath = process.argv[2]
if (!filePath) {
  console.error('Uso: node scripts/run-sql-file.mjs <ruta-al-archivo.sql>')
  process.exit(1)
}

const sql = fs.readFileSync(filePath, 'utf8')

const rawConnectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
// Quitamos sslmode de la connection string: si queda, pg-connection-string
// arma su propio objeto ssl (verify-full) e ignora el `ssl` que pasamos abajo,
// lo que rompe la conexión contra el certificado autofirmado del pooler.
const connectionString = rawConnectionString?.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '')

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
})

await client.connect()
try {
  await client.query(sql)
  console.log(`[v0] Migración aplicada correctamente: ${filePath}`)
} finally {
  await client.end()
}
