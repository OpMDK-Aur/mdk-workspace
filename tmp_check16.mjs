const base = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const res = await fetch(`${base}/auth/v1/verify`, {
  method: 'POST',
  headers: {
    apikey: anon,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    type: 'email',
    email: 'fmarin@madketing.io',
    token: '35648830',
  }),
})
console.log('status', res.status)
console.log(await res.text())
