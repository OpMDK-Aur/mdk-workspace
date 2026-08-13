import { redirect } from 'next/navigation'
import { SupervisorPlayground } from '@/components/ai/supervisor-playground'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Supervisor Agent | MDK Workspace',
  description: 'Interfaz aislada para validar el Supervisor Agent.',
}

export default async function AIPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login?next=/ai')

  return <SupervisorPlayground />
}
