import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // If onboarding already completed, go to dashboard
  if (profile?.onboarding_completed) {
    redirect('/dashboard')
  }

  const userName = profile?.full_name || user.email?.split('@')[0] || ''

  return <OnboardingFlow userName={userName} />
}
