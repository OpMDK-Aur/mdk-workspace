const base = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// get erika email
const colabRes = await fetch(`${base}/rest/v1/colaboradores?id=eq.b9bc1549-a988-4ed1-b9af-a91ba611a7cf&select=email,nombre`, {
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
})
const [erika] = await colabRes.json()
console.log('Erika:', erika)

const linkRes = await fetch(`${base}/auth/v1/admin/generate_link`, {
  method: 'POST',
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'magiclink', email: erika.email }),
})
const linkData = await linkRes.json()
console.log('email_otp:', linkData.email_otp)

const verifyRes = await fetch(`${base}/auth/v1/verify`, {
  method: 'POST',
  headers: { apikey: anon, 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'email', email: erika.email, token: linkData.email_otp }),
})
const session = await verifyRes.json()
console.log('access_token len:', session.access_token?.length)
console.log('refresh_token:', session.refresh_token)
