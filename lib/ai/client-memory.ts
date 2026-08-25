import { z } from 'zod'

export const CLIENT_MEMORY_FIELDS = ['industry', 'commercial_objective', 'product_type'] as const
export const CLIENT_MEMORY_ALL_FIELDS = [...CLIENT_MEMORY_FIELDS, 'primary_conversion_type'] as const

export const ClientMemorySchema = z.object({
  profile: z.object({
    industry: z.string().nullable(),
    commercial_objective: z.string().nullable(),
    product_type: z.string().nullable(),
    primary_conversion_type: z.string().nullable(),
  }),
  sources: z.object({
    industry: z.string().nullable(),
    commercial_objective: z.string().nullable(),
    product_type: z.string().nullable(),
    primary_conversion_type: z.string().nullable(),
  }),
  missing_fields: z.array(z.enum(CLIENT_MEMORY_FIELDS)),
  completeness: z.enum(['complete', 'partial', 'empty']),
})

export type ClientMemory = z.infer<typeof ClientMemorySchema>
export type ClientMemoryField = typeof CLIENT_MEMORY_ALL_FIELDS[number]

export function emptyClientMemory(): ClientMemory {
  return {
    profile: { industry: null, commercial_objective: null, product_type: null, primary_conversion_type: null },
    sources: { industry: null, commercial_objective: null, product_type: null, primary_conversion_type: null },
    missing_fields: [...CLIENT_MEMORY_FIELDS],
    completeness: 'empty',
  }
}

export function normalizeIndustry(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '_')
}

export function buildClientMemory(row?: Record<string, unknown> | null): ClientMemory {
  const profile = {
    industry: typeof row?.industry === 'string' ? row.industry : null,
    commercial_objective: typeof row?.commercial_objective === 'string' ? row.commercial_objective : null,
    product_type: typeof row?.product_type === 'string' ? row.product_type : null,
    primary_conversion_type: typeof row?.primary_conversion_type === 'string' ? row.primary_conversion_type : null,
  }
  const sources = {
    industry: typeof row?.industry_source === 'string' ? row.industry_source : null,
    commercial_objective: typeof row?.commercial_objective_source === 'string' ? row.commercial_objective_source : null,
    product_type: typeof row?.product_type_source === 'string' ? row.product_type_source : null,
    primary_conversion_type: typeof row?.primary_conversion_source === 'string' ? row.primary_conversion_source : null,
  }
  const missing_fields = CLIENT_MEMORY_FIELDS.filter((field) => !profile[field])
  return { profile, sources, missing_fields, completeness: missing_fields.length === CLIENT_MEMORY_FIELDS.length ? 'empty' : missing_fields.length ? 'partial' : 'complete' }
}
