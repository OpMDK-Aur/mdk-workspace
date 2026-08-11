import jwt from 'jsonwebtoken'

const secret = process.env.SUPABASE_JWT_SECRET
const email = 'jgomez@madketing.io'
const userId = '70f65f6e-8266-4850-a427-e9fdee6c9c7b'

const token = jwt.sign(
  {
    sub: userId,
    email,
    role: 'authenticated',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
  },
  secret
)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const res = await fetch(
  `${supabaseUrl}/rest/v1/notificaciones?colaborador_id=eq.${userId}&leida=eq.false&select=id,titulo,leida,tipo`,
  {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  }
)

console.log('Status:', res.status)
console.log('Body:', await res.text())
