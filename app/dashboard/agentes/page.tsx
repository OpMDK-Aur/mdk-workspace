'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AgentConfig, AgentLog, Profile } from '@/lib/types'
import { AgentCard } from '@/components/agentes/agent-card'
import { RedactorModal } from '@/components/agentes/redactor-modal'
import { RevOpsModal } from '@/components/agentes/revops-modal'
import { TesterModal } from '@/components/agentes/tester-modal'
import { Cpu } from 'lucide-react'

export default function AgentesPage() {
  const supabase = createClient()
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [logs, setLogs] = useState<Record<string, AgentLog | null>>({})
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Modal states
  const [redactorOpen, setRedactorOpen] = useState(false)
  const [revopsOpen, setRevopsOpen] = useState(false)
  const [testerOpen, setTesterOpen] = useState(false)

  useEffect(() => {
    async function fetchData() {
      // Get current user profile
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        setProfile(profileData)
      }

      // Fetch active agents
      const { data: agentsData } = await supabase
        .from('agentes_config')
        .select('*')
        .eq('activo', true)
        .order('trigger_type')
      
      if (agentsData) {
        setAgents(agentsData)
        
        // Fetch last log for each agent
        const logsMap: Record<string, AgentLog | null> = {}
        for (const agent of agentsData) {
          try {
            const { data: logData } = await supabase
              .from('agentes_log')
              .select('*')
              .eq('agente', agent.slug)
              .order('ejecutado_en', { ascending: false })
              .limit(1)
            logsMap[agent.slug] = (logData && logData.length > 0) ? logData[0] : null
          } catch (err) {
            console.error(`Error fetching logs for agent ${agent.slug}:`, err)
            logsMap[agent.slug] = null
          }
        }
        setLogs(logsMap)
      }
      
      setLoading(false)
    }
    
    fetchData()
  }, [supabase])

  const automaticAgents = agents.filter(a => a.trigger_type === 'cron_diario' || a.trigger_type === 'cron_semanal')
  const manualAgents = agents.filter(a => a.trigger_type === 'manual')

  const handleRun = (slug: string) => {
    if (slug === 'redactor') {
      setRedactorOpen(true)
    } else if (slug === 'revops') {
      setRevopsOpen(true)
    } else if (slug === 'tester') {
      setTesterOpen(true)
    } else if (slug === 'analista') {
      window.location.href = '/analista'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-muted-foreground">Cargando agentes...</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-[#7F77DD]/10">
          <Cpu className="h-6 w-6 text-[#7F77DD]" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Agentes IA</h1>
          <p className="text-sm text-muted-foreground">Automatiza tareas con inteligencia artificial</p>
        </div>
      </div>

      {/* Automatic Agents Section */}
      {automaticAgents.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-medium text-muted-foreground">Automaticos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {automaticAgents.map(agent => {
              let actionHref: string | undefined
              if (agent.slug === 'controller') {
                actionHref = '/dashboard/agentes/controller'
              } else if (agent.slug === 'tester') {
                actionHref = '/dashboard/agentes/tester'
              }
              
              return (
                <AgentCard
                  key={agent.id}
                  agente={agent}
                  lastLog={logs[agent.slug]}
                  onRun={handleRun}
                  profile={profile}
                  actionHref={actionHref}
                />
              )
            })}
          </div>
        </section>
      )}

      {/* Manual Agents Section */}
      {manualAgents.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-medium text-muted-foreground">Manuales</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {manualAgents.map(agent => (
              <AgentCard
                key={agent.id}
                agente={agent}
                lastLog={logs[agent.slug]}
                onRun={handleRun}
                profile={profile}
              />
            ))}
          </div>
        </section>
      )}

      {/* Modals */}
      <RedactorModal open={redactorOpen} onOpenChange={setRedactorOpen} />
      <RevOpsModal open={revopsOpen} onOpenChange={setRevopsOpen} />
      <TesterModal open={testerOpen} onOpenChange={setTesterOpen} />
    </div>
  )
}
