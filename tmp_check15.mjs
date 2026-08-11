const base = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const res = await fetch(`${base}/auth/v1/admin/generate_link`, {
  method: 'POST',
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    type: 'magiclink',
    email: 'fmarin@madketing.io',
  }),
})
const data = await res.json()
console.log(JSON.stringify(data, null, 2))
