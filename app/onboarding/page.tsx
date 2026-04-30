import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: colaborador } = await supabase
    .from('colaboradores')
    .select('*')
    .eq('id', user.id)
    .single()

  // If onboarding already completed, go to dashboard
  if (colaborador?.onboarding_completado) {
    redirect('/dashboard')
  }

  const userName = colaborador ? `${colaborador.nombre} ${colaborador.apellido || ''}`.trim() : user.email?.split('@')[0] || ''

  return <OnboardingFlow userName={userName} />
}
