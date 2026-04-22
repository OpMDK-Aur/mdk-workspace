// Time Tracking Types

export interface Client {
  id: string
  name: string
  color: string // hex
  logo_initials: string // e.g. "AC" for Acme Corp
}

export interface TimeEntry {
  id: string
  user_id: string
  project_id: string | null
  task_id: string | null
  description: string
  started_at: string // ISO timestamptz
  ended_at: string | null // null = timer running
  duration_sec: number | null
  billable: boolean
}

export interface Project {
  id: string
  name: string
  color: string // hex color
  team_id: string
  client_id: string | null
}

export interface Task {
  id: string
  name: string
  project_id: string
  estimated_h: number | null
}

export interface TeamMember {
  id: string
  name: string
  email: string
  avatar_url: string | null
  role: 'admin' | 'member'
  is_tracking: boolean
  current_task: string | null
  weekly_hours: number
}

export interface DailyHours {
  date: string
  hours: number
}

export interface ProjectSummary {
  project_id: string
  project_name: string
  project_color: string
  hours: number
  percentage: number
  billable_hours: number
}

export interface ClientSummary {
  client_id: string
  client_name: string
  client_color: string
  projects_count: number
  hours: number
  percentage: number
  billable_hours: number
}
