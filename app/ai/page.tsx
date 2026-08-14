import { redirect } from 'next/navigation'
import { SupervisorPlayground } from '@/components/ai/supervisor-playground'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Supervisor Agent | MDK Workspace',
  description: 'Interfaz aislada para validar el Supervisor Agent.',
}

export default async function AIPage({ searchParams }: { searchParams: Promise<{ client_id?: string }> }) {
  const { client_id: clientId } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login?next=/ai')

  return <SupervisorPlayground clientId={clientId ?? null} />
}
