import type { CopilotPlatform } from '@/lib/conexa/copilot/types'
import { crmExecutor } from './crm'
import { googleAdsExecutor } from './google-ads'
import { gtmExecutor } from './gtm'
import { metaExecutor } from './meta'
import type { Executor } from './types'

const executors: Record<CopilotPlatform, Executor> = {
  meta: metaExecutor,
  'google-ads': googleAdsExecutor,
  crm: crmExecutor,
  tracking: gtmExecutor,
}

export const getExecutor = (platform: CopilotPlatform) => executors[platform]
export type { ExecutionRecord } from './types'
