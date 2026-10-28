import type { Recommendation } from '@/lib/conexa/copilot/types'

export type ExecutionRecord = { recId: string; platform: Recommendation['platform']; entity: string; before: string; after: string; appliedAt: string }

export type Executor = {
  apply: (rec: Recommendation) => Promise<ExecutionRecord>
  revert: (record: ExecutionRecord) => Promise<void>
}

/** Stub común: no llama a la plataforma, solo registra el cambio y guarda `before` para revertir. */
export function createStubExecutor(platform: Recommendation['platform']): Executor {
  return {
    async apply(rec) {
      const record = { recId: rec.id, platform, entity: rec.entity, before: rec.before, after: rec.after, appliedAt: new Date().toISOString() }
      console.info(`[conexa:executor:${platform}] apply`, record)
      return record
    },
    async revert(record) {
      console.info(`[conexa:executor:${platform}] revert`, { ...record, restored: record.before })
    },
  }
}
