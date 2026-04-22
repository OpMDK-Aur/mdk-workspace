'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { TeamMember } from '@/lib/time-tracking/types'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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

interface TeamMemberListProps {
  members: TeamMember[]
  isAdmin: boolean
}

export function TeamMemberList({ members, isAdmin }: TeamMemberListProps) {
  const router = useRouter()
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)
  const [newRole, setNewRole] = useState<'admin' | 'member'>('member')
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
        .from('users')
        .update({ role: newRole })
        .eq('id', editingMember.id)

      if (error) {
        console.error('[v0] Error updating role:', error)
      } else {
        router.refresh()
      }
    } catch (err) {
      console.error('[v0] Error updating role:', err)
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
            <Select value={newRole} onValueChange={(val) => setNewRole(val as 'admin' | 'member')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
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
              <Badge 
                variant={member.role === 'admin' ? 'default' : 'secondary'} 
                className={cn(
                  'text-xs',
                  member.role === 'admin' && 'bg-blue-600 hover:bg-blue-700'
                )}
              >
                {member.role === 'admin' ? 'Admin' : 'Member'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground truncate mt-0.5">
              {member.email}
            </p>
          </div>

          {/* Status Indicator & Admin Menu */}
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'h-2.5 w-2.5 rounded-full shrink-0',
                member.is_tracking ? 'bg-status-verde' : 'bg-muted-foreground/40'
              )}
              title={member.is_tracking ? 'Currently tracking' : 'Idle'}
            />
            
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
