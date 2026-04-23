'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MoreHorizontal, Eye, UserCog } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TeamMember {
  id: string
  name: string
  email: string
  avatar_url: string | null
  accent_hue: number | null
  role: string
  is_tracking: boolean
  current_task: string | null
  current_client: string | null
  weekly_hours: number
}

interface TeamMemberListProps {
  members: TeamMember[]
  isAdmin: boolean
}

export function TeamMemberList({ members, isAdmin }: TeamMemberListProps) {
  const router = useRouter()
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)
  const [newRole, setNewRole] = useState<string>('project_manager')
  const [isSaving, setIsSaving] = useState(false)

  const handleEditRole = (member: TeamMember) => {
    setEditingMember(member)
    setNewRole(member.role)
  }

  const handleSaveRole = async () => {
    if (!editingMember) return
    
    setIsSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', editingMember.id)

      if (error) {
        console.error('Error updating role:', error)
      } else {
        router.refresh()
      }
    } catch (err) {
      console.error('Error updating role:', err)
    } finally {
      setIsSaving(false)
      setEditingMember(null)
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map((member) => (
          <TeamMemberCard
            key={member.id}
            member={member}
            isAdmin={isAdmin}
            onEditRole={() => handleEditRole(member)}
          />
        ))}
      </div>

      {/* Edit Role Dialog */}
      <Dialog open={!!editingMember} onOpenChange={(open) => !open && setEditingMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Role</DialogTitle>
            <DialogDescription>
              Change the role for {editingMember?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project_manager">Project Manager</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMember(null)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveRole} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

interface TeamMemberCardProps {
  member: TeamMember
  isAdmin: boolean
  onEditRole: () => void
}

function TeamMemberCard({ member, isAdmin, onEditRole }: TeamMemberCardProps) {
  const initials = member.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  // Calculate progress towards 40h week
  const targetHours = 40
  const progressPercent = Math.min((member.weekly_hours / targetHours) * 100, 100)

  // Map role to display name
  const roleDisplayName = member.role === 'project_manager' ? 'Project Manager' : member.role

  // Generate avatar background color from accent_hue
  const avatarBgColor = member.accent_hue !== null 
    ? `hsl(${member.accent_hue}, 70%, 45%)` 
    : 'hsl(var(--primary))'

  return (
    <Card className="hover:border-primary/20 transition-colors">
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div 
            className="h-12 w-12 shrink-0 rounded-full flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: member.avatar_url ? undefined : avatarBgColor }}
          >
            {member.avatar_url ? (
              <img 
                src={member.avatar_url} 
                alt={member.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-white font-medium text-sm">
                {initials}
              </span>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium text-foreground truncate">
                {member.name}
              </h3>
              <Badge 
                variant="secondary"
                className="text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
              >
                {roleDisplayName}
              </Badge>
            </div>
            <p className="text-[13px] text-muted-foreground truncate mt-0.5">
              {member.email}
            </p>
          </div>

          {/* Admin Menu */}
          <div className="flex items-center gap-2">
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/dashboard/time?user_id=${member.id}`}>
                      <Eye className="h-4 w-4 mr-2" />
                      View entries
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onEditRole}>
                    <UserCog className="h-4 w-4 mr-2" />
                    Edit role
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Tracking Status */}
        <div className="mt-4 p-3 rounded-lg bg-muted/50">
          {member.is_tracking ? (
            <div className="flex items-start gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-status-verde mt-1.5 animate-pulse shrink-0" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5">
                  Trackeando
                </div>
                <p className="text-sm font-medium text-foreground truncate">
                  {member.current_task || 'Sin descripción'}
                  {member.current_client && (
                    <span className="text-muted-foreground font-normal"> · {member.current_client}</span>
                  )}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40 shrink-0" />
              <span className="text-sm text-muted-foreground">Sin actividad</span>
            </div>
          )}
        </div>

        {/* Weekly Hours */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">{member.weekly_hours.toFixed(1)}h esta semana</span>
            <span className="font-mono font-medium tabular-nums text-muted-foreground">
              / {targetHours}h
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
      </CardContent>
    </Card>
  )
}
