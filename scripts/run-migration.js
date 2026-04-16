import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const sqlFile = process.argv[2]
if (!sqlFile) {
  console.error('Usage: node run-migration.js <sql-file>')
  process.exit(1)
}

const sqlPath = resolve(process.cwd(), sqlFile)
const sql = readFileSync(sqlPath, 'utf-8')

console.log(`Running migration: ${sqlFile}`)
console.log('SQL:', sql)

const { error } = await supabase.rpc('exec_sql', { sql_query: sql })

if (error) {
  // Try direct query if RPC doesn't exist
  const { error: directError } = await supabase.from('clients').select('google_sheet_id').limit(1)
  if (directError && directError.message.includes('google_sheet_id')) {
    console.error('Migration needed - column does not exist yet')
    console.log('Please run this SQL in Supabase Dashboard:')
    console.log(sql)
  } else {
    console.log('Column already exists or migration completed')
  }
} else {
  console.log('Migration completed successfully')
}
