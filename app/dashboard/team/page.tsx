import { createClient } from '@/lib/supabase/server'
import { TeamMemberList } from '@/components/team/team-member-list'
import { Card, CardContent } from '@/components/ui/card'
import { Users, Clock, UserCheck } from 'lucide-react'

interface Colaborador {
  id: string
  email: string
  nombre: string
  apellido: string | null
  rol_id: string | null
  avatar_url: string | null
  accent_hue: number | null
  theme: 'dark' | 'light'
  onboarding_completado: boolean
  created_at: string
}

function getStartOfWeek(): string {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
  const monday = new Date(now.setDate(diff))
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString()
}

export default async function TeamPage() {
  const supabase = await createClient()
  const startOfWeek = getStartOfWeek()

  // Fetch current user to check admin status
  const { data: { user: authUser } } = await supabase.auth.getUser()
  
  let isAdmin = false
  if (authUser) {
    const { data: currentColaborador } = await supabase
      .from('colaboradores')
      .select('rol_id')
      .eq('id', authUser.id)
      .single()
    
    // TODO: Check rol_id against roles table for project_manager
    isAdmin = !!currentColaborador
  }

  // Fetch all colaboradores
  const { data: colaboradores } = await supabase
    .from('colaboradores')
    .select('*')
    .order('nombre')

  const typedColaboradores: Colaborador[] = (colaboradores || []) as Colaborador[]

  // Fetch weekly time entries (completed only)
  const { data: weekEntries } = await supabase
    .from('time_entries')
    .select('user_id, duration_sec')
    .gte('started_at', startOfWeek)
    .not('ended_at', 'is', null)

  // Build hours map: user_id → total hours this week
  const weeklyHoursByUser: Record<string, number> = {}
  weekEntries?.forEach((entry) => {
    if (entry.user_id) {
      weeklyHoursByUser[entry.user_id] = (weeklyHoursByUser[entry.user_id] ?? 0) + ((entry.duration_sec ?? 0) / 3600)
    }
  })

  // Fetch active timers (entries with ended_at = null) including client name
  const { data: activeTimers } = await supabase
    .from('time_entries')
    .select('user_id, description, clientes:cliente_id(nombre_del_negocio)')
    .is('ended_at', null)

  // Map active timers by user_id
  const activeTimerByUser: Record<string, { description: string; client: string }> = {}
  activeTimers?.forEach((entry: any) => {
    if (entry.user_id) {
      activeTimerByUser[entry.user_id] = {
        description: entry.description || '',
        client: entry.clientes?.nombre_del_negocio ?? '',
      }
    }
  })

  // Transform colaboradores to team members format
  const teamMembers = typedColaboradores.map((colaborador) => {
    const weeklyHours = weeklyHoursByUser[colaborador.id] ?? 0
    const activeTimer = activeTimerByUser[colaborador.id]
    
    return {
      id: colaborador.id,
      name: `${colaborador.nombre} ${colaborador.apellido || ''}`.trim() || 'Unknown',
      email: colaborador.email || '',
      avatar_url: colaborador.avatar_url,
      accent_hue: colaborador.accent_hue,
      role: 'colaborador',
      is_tracking: !!activeTimer,
      current_task: activeTimer?.description || null,
      current_client: activeTimer?.client || null,
      weekly_hours: weeklyHours,
    }
  })

  // Calculate stats
  const totalWeeklyHours = teamMembers.reduce(
    (acc, member) => acc + member.weekly_hours,
    0
  )
  const activeMembers = teamMembers.filter((m) => m.is_tracking).length
  const averageHours = teamMembers.length > 0 
    ? totalWeeklyHours / teamMembers.length 
    : 0

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Team</h1>
        <p className="text-muted-foreground mt-1">
          Monitor your team&apos;s time tracking activity
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">
                  Total Team Hours
                </div>
                <div className="text-2xl font-bold text-foreground">
                  {totalWeeklyHours.toFixed(1)}h
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-status-verde/10 flex items-center justify-center">
                <UserCheck className="h-5 w-5 text-status-verde" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">
                  Currently Tracking
                </div>
                <div className="text-2xl font-bold text-foreground">
                  {activeMembers}
                  <span className="text-lg font-normal text-muted-foreground">
                    {' '}
                    / {teamMembers.length}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center">
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Avg. Hours</div>
                <div className="text-2xl font-bold text-foreground">
                  {averageHours.toFixed(1)}h
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Team Member Cards */}
      {teamMembers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No team members yet</h3>
            <p className="text-muted-foreground">
              Team members will appear here once they sign up.
            </p>
          </CardContent>
        </Card>
      ) : (
        <TeamMemberList members={teamMembers} isAdmin={isAdmin} />
      )}
    </div>
  )
}
