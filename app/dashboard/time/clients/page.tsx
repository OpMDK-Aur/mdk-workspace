import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Client } from '@/lib/time-tracking/types'
import { Card, CardContent } from '@/components/ui/card'
import { Building2, FolderOpen, DollarSign } from 'lucide-react'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

export default async function TimeClientsPage() {
  const supabase = await createClient()

  // Fetch all clients
  const { data: clients, error: clientsError } = await supabase
    .from('clients')
    .select('*')
    .order('name')

  // Fetch project counts per client
  const { data: projects } = await supabase
    .from('projects')
    .select('id, client_id')

  if (clientsError) {
    console.error('[v0] Error fetching clients:', clientsError)
  }

  const typedClients: Client[] = clients || []

  // Calculate project counts per client
  const projectCountByClient = (projects || []).reduce((acc, project) => {
    if (project.client_id) {
      acc[project.client_id] = (acc[project.client_id] || 0) + 1
    }
    return acc
  }, {} as Record<string, number>)

  // Calculate totals
  const totalClients = typedClients.length
  const totalProjects = projects?.length || 0
  const totalHours = typedClients.reduce((acc, c) => acc + (c.total_hours || 0), 0)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Clients</h1>
          <p className="text-muted-foreground mt-1">
            Manage and track time across your clients
          </p>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Clients</div>
                <div className="text-2xl font-bold text-foreground">{totalClients}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <FolderOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Active Projects</div>
                <div className="text-2xl font-bold text-foreground">{totalProjects}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Hours</div>
                <div className="text-2xl font-bold text-foreground">
                  {totalHours.toFixed(1)}h
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Client Cards */}
      {typedClients.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No clients yet</h3>
            <p className="text-muted-foreground">
              Add your first client to start tracking time.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {typedClients.map((client) => {
            const projectCount = projectCountByClient[client.id] || 0
            const estimatedCost = (client.total_hours || 0) * (client.hourly_rate || 0)

            return (
              <Link key={client.id} href={`/dashboard/time/clients/${client.id}`}>
                <Card className="hover:border-primary/30 transition-colors cursor-pointer h-full">
                  <CardContent className="pt-6">
                    {/* Client Header */}
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="h-10 w-10 rounded-lg flex items-center justify-center text-sm font-bold text-white shrink-0"
                        style={{ backgroundColor: client.color }}
                      >
                        {client.logo_initials}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-foreground truncate">{client.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {projectCount} active project{projectCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>

                    {/* Hours & Rate Stats */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className="text-xs text-muted-foreground">Tracked</div>
                        <div className="text-lg font-semibold text-foreground">
                          {(client.total_hours || 0).toFixed(1)}h
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Hourly Rate</div>
                        <div className="text-lg font-semibold text-foreground">
                          {formatCurrency(client.hourly_rate || 0)}/hr
                        </div>
                      </div>
                    </div>

                    {/* Estimated Cost */}
                    <div className="pt-3 border-t border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Total</span>
                        <span className="text-lg font-bold text-foreground">
                          {formatCurrency(estimatedCost)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
