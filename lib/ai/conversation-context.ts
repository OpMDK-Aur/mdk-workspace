import { z } from 'zod'

export const ConversationWorkingContextSchema = z.object({
  client_id: z.string(),
  last_intent: z.string().nullable(),
  platforms: z.array(z.enum(['google', 'meta'])),
  account_ids: z.array(z.string()),
  period: z.object({ from: z.string(), to: z.string() }).nullable(),
  referenced_entities: z.array(z.object({
    platform: z.enum(['google', 'meta']), account_id: z.string(), entity_type: z.string(), entity_id: z.string(), entity_name: z.string().nullable(),
  })),
  referenced_change_events: z.array(z.object({
    source_event_id: z.string(), platform: z.enum(['google', 'meta']), account_id: z.string(), entity_type: z.string().nullable(), entity_id: z.string().nullable(), entity_name: z.string().nullable(), occurred_at: z.string().nullable(),
  })),
  last_analysis_run_id: z.string().nullable(),
})

export type ConversationWorkingContext = z.infer<typeof ConversationWorkingContextSchema>

export function emptyWorkingContext(clientId: string): ConversationWorkingContext {
  return { client_id: clientId, last_intent: null, platforms: [], account_ids: [], period: null, referenced_entities: [], referenced_change_events: [], last_analysis_run_id: null }
}

export function mergeWorkingContext(base: ConversationWorkingContext, patch: Partial<ConversationWorkingContext>): ConversationWorkingContext {
  const merged = { ...base, ...patch, platforms: patch.platforms ?? base.platforms, account_ids: patch.account_ids ?? base.account_ids, referenced_entities: patch.referenced_entities ?? base.referenced_entities, referenced_change_events: patch.referenced_change_events ?? base.referenced_change_events }
  return ConversationWorkingContextSchema.parse(merged)
}

export function compactEventReference(event: { platform: 'google' | 'meta'; account_id: string; occurred_at: string; entity: { type: string; id: string | null; name: string | null }; metadata: { resource_name: string | null } }): ConversationWorkingContext['referenced_change_events'][number] {
  return { source_event_id: event.metadata.resource_name ?? `${event.platform}:${event.account_id}:${event.occurred_at}`, platform: event.platform, account_id: event.account_id, entity_type: event.entity.type, entity_id: event.entity.id, entity_name: event.entity.name, occurred_at: event.occurred_at }
}

export function contextFromEvents(clientId: string, events: Array<{ platform: 'google' | 'meta'; account_id: string; occurred_at: string; entity: { type: string; id: string | null; name: string | null }; metadata: { resource_name: string | null } }>, period?: { from: string; to: string } | null) {
  const refs = events.map(compactEventReference)
  return { client_id: clientId, platforms: [...new Set(events.map((event) => event.platform))], account_ids: [...new Set(events.map((event) => event.account_id))], period: period ?? null, referenced_entities: [...new Map(events.filter((event) => event.entity.id).map((event) => [`${event.platform}:${event.account_id}:${event.entity.type}:${event.entity.id}`, { platform: event.platform, account_id: event.account_id, entity_type: event.entity.type, entity_id: event.entity.id!, entity_name: event.entity.name }])).values()], referenced_change_events: [...new Map(refs.map((ref) => [ref.source_event_id, ref])).values()], last_intent: 'change_history', last_analysis_run_id: null }
}
