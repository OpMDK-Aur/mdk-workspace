import { useTaskStore } from './task-store'

let panelChunk: Promise<unknown> | null = null

export function preloadTaskDetailPanel() {
  panelChunk ??= import('@/components/tasks/task-detail-panel').catch(() => {
    panelChunk = null
  })
  return panelChunk
}

export function prefetchTask(taskId: string) {
  preloadTaskDetailPanel()
  useTaskStore.getState().prefetchComments(taskId)
}
