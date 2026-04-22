'use client'

import { mockTeamMembers } from '@/lib/time-tracking/mock-data'
import { TeamMemberCard } from '@/components/team/team-member-card'
import { Card, CardContent } from '@/components/ui/card'
import { Users, Clock, UserCheck } from 'lucide-react'

export default function TeamPage() {
  const totalWeeklyHours = mockTeamMembers.reduce(
    (acc, member) => acc + member.weekly_hours,
    0
  )
  const activeMembers = mockTeamMembers.filter((m) => m.is_tracking).length
  const averageHours = totalWeeklyHours / mockTeamMembers.length

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
                    / {mockTeamMembers.length}
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockTeamMembers.map((member) => (
          <TeamMemberCard key={member.id} member={member} />
        ))}
      </div>
    </div>
  )
}
