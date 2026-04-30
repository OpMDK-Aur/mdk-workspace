import type { TimeEntry, Project, Task, TeamMember, DailyHours, ProjectSummary } from './types'

// Projects
export const mockProjects: Project[] = [
  { id: 'proj-1', name: 'Website Redesign', color: '#3b82f6', team_id: 'team-1', client_id: 'client-1' },
  { id: 'proj-2', name: 'Mobile App', color: '#10b981', team_id: 'team-1', client_id: 'client-2' },
  { id: 'proj-3', name: 'Marketing Campaign', color: '#f59e0b', team_id: 'team-1', client_id: 'client-3' },
]

// Tasks
export const mockTasks: Task[] = [
  { id: 'task-1', name: 'Design mockups', project_id: 'proj-1', estimated_h: 20 },
  { id: 'task-2', name: 'Frontend development', project_id: 'proj-1', estimated_h: 40 },
  { id: 'task-3', name: 'Backend API', project_id: 'proj-1', estimated_h: 30 },
  { id: 'task-4', name: 'UI implementation', project_id: 'proj-2', estimated_h: 25 },
  { id: 'task-5', name: 'Testing', project_id: 'proj-2', estimated_h: 15 },
  { id: 'task-6', name: 'Content creation', project_id: 'proj-3', estimated_h: 12 },
  { id: 'task-7', name: 'Social media', project_id: 'proj-3', estimated_h: 8 },
]

// Helper to get date strings
function getDateString(daysAgo: number): string {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return date.toISOString()
}

function getTimeString(daysAgo: number, hour: number, minute: number): string {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

// Time Entries - realistic data across the last 7 days
export const mockTimeEntries: TimeEntry[] = [
  // Today
  {
    id: 'entry-1',
    user_id: 'user-1',
    project_id: 'proj-1',
    task_id: 'task-2',
    description: 'Working on homepage responsive layout',
    started_at: getTimeString(0, 9, 0),
    ended_at: getTimeString(0, 11, 30),
    duration_sec: 9000, // 2.5 hours
    billable: true,
  },
  {
    id: 'entry-2',
    user_id: 'user-1',
    project_id: 'proj-2',
    task_id: 'task-4',
    description: 'Implementing navigation component',
    started_at: getTimeString(0, 12, 0),
    ended_at: getTimeString(0, 14, 15),
    duration_sec: 8100, // 2.25 hours
    billable: true,
  },
  {
    id: 'entry-3',
    user_id: 'user-1',
    project_id: 'proj-3',
    task_id: 'task-6',
    description: 'Writing blog post about new features',
    started_at: getTimeString(0, 14, 30),
    ended_at: getTimeString(0, 16, 0),
    duration_sec: 5400, // 1.5 hours
    billable: false,
  },
  // Yesterday
  {
    id: 'entry-4',
    user_id: 'user-1',
    project_id: 'proj-1',
    task_id: 'task-1',
    description: 'Creating wireframes for dashboard',
    started_at: getTimeString(1, 9, 30),
    ended_at: getTimeString(1, 12, 0),
    duration_sec: 9000, // 2.5 hours
    billable: true,
  },
  {
    id: 'entry-5',
    user_id: 'user-1',
    project_id: 'proj-1',
    task_id: 'task-3',
    description: 'Setting up API endpoints for user auth',
    started_at: getTimeString(1, 13, 0),
    ended_at: getTimeString(1, 17, 30),
    duration_sec: 16200, // 4.5 hours
    billable: true,
  },
  // 2 days ago
  {
    id: 'entry-6',
    user_id: 'user-1',
    project_id: 'proj-2',
    task_id: 'task-4',
    description: 'Building settings screen UI',
    started_at: getTimeString(2, 10, 0),
    ended_at: getTimeString(2, 13, 30),
    duration_sec: 12600, // 3.5 hours
    billable: true,
  },
  {
    id: 'entry-7',
    user_id: 'user-1',
    project_id: 'proj-2',
    task_id: 'task-5',
    description: 'Writing unit tests for login flow',
    started_at: getTimeString(2, 14, 0),
    ended_at: getTimeString(2, 16, 30),
    duration_sec: 9000, // 2.5 hours
    billable: false,
  },
  // 3 days ago
  {
    id: 'entry-8',
    user_id: 'user-1',
    project_id: 'proj-3',
    task_id: 'task-7',
    description: 'Scheduling social media posts',
    started_at: getTimeString(3, 9, 0),
    ended_at: getTimeString(3, 11, 0),
    duration_sec: 7200, // 2 hours
    billable: false,
  },
  {
    id: 'entry-9',
    user_id: 'user-1',
    project_id: 'proj-1',
    task_id: 'task-2',
    description: 'Fixing mobile navigation bugs',
    started_at: getTimeString(3, 13, 0),
    ended_at: getTimeString(3, 18, 0),
    duration_sec: 18000, // 5 hours
    billable: true,
  },
  // 4 days ago
  {
    id: 'entry-10',
    user_id: 'user-1',
    project_id: 'proj-1',
    task_id: 'task-1',
    description: 'Review design feedback and iterations',
    started_at: getTimeString(4, 10, 0),
    ended_at: getTimeString(4, 12, 30),
    duration_sec: 9000, // 2.5 hours
    billable: true,
  },
  {
    id: 'entry-11',
    user_id: 'user-1',
    project_id: 'proj-2',
    task_id: 'task-4',
    description: 'Implementing dark mode toggle',
    started_at: getTimeString(4, 14, 0),
    ended_at: getTimeString(4, 17, 0),
    duration_sec: 10800, // 3 hours
    billable: true,
  },
  // 5 days ago
  {
    id: 'entry-12',
    user_id: 'user-1',
    project_id: 'proj-3',
    task_id: 'task-6',
    description: 'Creating email newsletter template',
    started_at: getTimeString(5, 9, 0),
    ended_at: getTimeString(5, 12, 0),
    duration_sec: 10800, // 3 hours
    billable: false,
  },
  {
    id: 'entry-13',
    user_id: 'user-1',
    project_id: 'proj-1',
    task_id: 'task-3',
    description: 'Database schema optimization',
    started_at: getTimeString(5, 13, 30),
    ended_at: getTimeString(5, 17, 30),
    duration_sec: 14400, // 4 hours
    billable: true,
  },
  // 6 days ago
  {
    id: 'entry-14',
    user_id: 'user-1',
    project_id: 'proj-2',
    task_id: 'task-5',
    description: 'Integration testing with backend',
    started_at: getTimeString(6, 10, 0),
    ended_at: getTimeString(6, 14, 0),
    duration_sec: 14400, // 4 hours
    billable: true,
  },
  {
    id: 'entry-15',
    user_id: 'user-1',
    project_id: 'proj-1',
    task_id: 'task-2',
    description: 'Code review and refactoring',
    started_at: getTimeString(6, 15, 0),
    ended_at: getTimeString(6, 17, 30),
    duration_sec: 9000, // 2.5 hours
    billable: true,
  },
]

// Team Members
export const mockTeamMembers: TeamMember[] = [
  {
    id: 'user-1',
    name: 'Alex Johnson',
    email: 'alex@company.com',
    avatar_url: null,
    role: 'admin',
    is_tracking: true,
    current_task: 'Working on homepage responsive layout',
    weekly_hours: 38.5,
  },
  {
    id: 'user-2',
    name: 'Sarah Chen',
    email: 'sarah@company.com',
    avatar_url: null,
    role: 'member',
    is_tracking: true,
    current_task: 'API documentation',
    weekly_hours: 42.25,
  },
  {
    id: 'user-3',
    name: 'Michael Brown',
    email: 'michael@company.com',
    avatar_url: null,
    role: 'member',
    is_tracking: false,
    current_task: null,
    weekly_hours: 35.0,
  },
  {
    id: 'user-4',
    name: 'Emily Davis',
    email: 'emily@company.com',
    avatar_url: null,
    role: 'member',
    is_tracking: true,
    current_task: 'Mobile app testing',
    weekly_hours: 40.75,
  },
  {
    id: 'user-5',
    name: 'David Wilson',
    email: 'david@company.com',
    avatar_url: null,
    role: 'member',
    is_tracking: false,
    current_task: null,
    weekly_hours: 28.5,
  },
]

// Daily hours for reports chart (last 7 days)
export const mockDailyHours: DailyHours[] = [
  { date: getDateString(6).split('T')[0], hours: 6.5 },
  { date: getDateString(5).split('T')[0], hours: 7.0 },
  { date: getDateString(4).split('T')[0], hours: 5.5 },
  { date: getDateString(3).split('T')[0], hours: 7.0 },
  { date: getDateString(2).split('T')[0], hours: 6.0 },
  { date: getDateString(1).split('T')[0], hours: 7.0 },
  { date: getDateString(0).split('T')[0], hours: 6.25 },
]

// Project summaries for reports
export const mockProjectSummaries: ProjectSummary[] = [
  {
    project_id: 'proj-1',
    project_name: 'Website Redesign',
    project_color: '#3b82f6',
    hours: 24.5,
    percentage: 53.3,
    billable_hours: 24.5,
  },
  {
    project_id: 'proj-2',
    project_name: 'Mobile App',
    project_color: '#10b981',
    hours: 15.25,
    percentage: 33.2,
    billable_hours: 12.75,
  },
  {
    project_id: 'proj-3',
    project_name: 'Marketing Campaign',
    project_color: '#f59e0b',
    hours: 6.5,
    percentage: 14.1,
    billable_hours: 0,
  },
]

// Helper functions
export function getProjectById(id: string): Project | undefined {
  return mockProjects.find((p) => p.id === id)
}

export function getTaskById(id: string): Task | undefined {
  return mockTasks.find((t) => t.id === id)
}

export function getTasksByProjectId(projectId: string): Task[] {
  return mockTasks.filter((t) => t.project_id === projectId)
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || isNaN(seconds) || seconds === 0) return '00:00:00'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export function formatDurationShort(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || isNaN(seconds) || seconds === 0) return '0h 0m'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

export function formatTimeRange(startedAt: string | null | undefined, endedAt: string | null | undefined): string {
  if (!startedAt) return 'Invalid Date'
  
  const start = new Date(startedAt)
  if (isNaN(start.getTime())) return 'Invalid Date'
  
  const startTime = start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  
  if (!endedAt) return `${startTime} - running`
  
  const end = new Date(endedAt)
  if (isNaN(end.getTime())) return `${startTime} - running`
  
  const endTime = end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${startTime} - ${endTime}`
}

export function groupEntriesByDay(entries: TimeEntry[]): Map<string, TimeEntry[]> {
  const grouped = new Map<string, TimeEntry[]>()
  
  entries.forEach((entry) => {
    const date = new Date(entry.started_at).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const existing = grouped.get(date) || []
    grouped.set(date, [...existing, entry])
  })
  
  return grouped
}

export function getDayLabel(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Invalid Date'
  
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return 'Invalid Date'
  
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  
  if (date.toDateString() === today.toDateString()) {
    return 'Hoy'
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Ayer'
  }
  
  return date.toLocaleDateString('es-AR', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

export function calculateDayTotal(entries: TimeEntry[]): number {
  return entries.reduce((acc, entry) => acc + (entry.duration_sec || 0), 0)
}

// Client helper functions (for project lookups)
export function getProjectsByClientId(clientId: string): Project[] {
  return mockProjects.filter((p) => p.client_id === clientId)
}
