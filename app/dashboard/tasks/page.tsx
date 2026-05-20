import { TaskBoard } from '@/components/tasks/task-board'

// Force chunk rebuild v3
export default function TasksPage() {
  return (
    <div className="h-[calc(100vh-64px)]">
      <TaskBoard />
    </div>
  )
}
