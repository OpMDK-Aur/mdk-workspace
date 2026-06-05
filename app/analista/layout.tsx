import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AnalistaRootLayout({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="dark bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  )
}
