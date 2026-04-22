'use client'

import type { TeamMember } from '@/lib/time-tracking/types'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

interface TeamMemberCardProps {
  member: TeamMember
}

export function TeamMemberCard({ member }: TeamMemberCardProps) {
  const initials = member.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  // Calculate progress towards 40h week
  const targetHours = 40
  const progressPercent = Math.min((member.weekly_hours / targetHours) * 100, 100)

  return (
    <Card className="hover:border-primary/20 transition-colors">
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <Avatar className="h-12 w-12 shrink-0">
            {member.avatar_url && (
              <AvatarImage src={member.avatar_url} alt={member.name} />
            )}
            <AvatarFallback className="bg-primary text-primary-foreground font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-foreground truncate">
                {member.name}
              </h3>
              {member.role === 'admin' && (
                <Badge variant="secondary" className="text-xs">
                  Admin
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate mt-0.5">
              {member.email}
            </p>
          </div>

          {/* Status Indicator */}
          <div
            className={cn(
              'h-2.5 w-2.5 rounded-full shrink-0 mt-1.5',
              member.is_tracking ? 'bg-status-verde' : 'bg-muted-foreground/40'
            )}
            title={member.is_tracking ? 'Currently tracking' : 'Idle'}
          />
        </div>

        {/* Current Task */}
        <div className="mt-4 p-3 rounded-lg bg-muted/50">
          {member.is_tracking && member.current_task ? (
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Currently tracking
              </div>
              <p className="text-sm font-medium text-foreground truncate">
                {member.current_task}
              </p>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Idle</div>
          )}
        </div>

        {/* Weekly Hours */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">Weekly hours</span>
            <span className="font-mono font-medium tabular-nums">
              {member.weekly_hours.toFixed(1)}h
              <span className="text-muted-foreground font-normal"> / {targetHours}h</span>
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
      </CardContent>
    </Card>
  )
}
