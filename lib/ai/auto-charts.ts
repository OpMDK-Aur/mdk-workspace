type ToolResultLike = { toolName?: string; output?: unknown }
type StepLike = { toolResults?: ToolResultLike[] }

type ChartRow = { name: string; inversion: number; resultados: number }

const MAX_ITEMS = 8

function toNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function cleanName(value: unknown) {
  const name = typeof value === 'string' && value.trim() ? value.trim() : 'Sin nombre'
  const normalized = name.replace(/\|/g, ' - ').replace(/\s+/g, ' ')
  return normalized.length > 42 ? `${normalized.slice(0, 40)}…` : normalized
}

function collectCampaigns(output: unknown, platform: 'meta' | 'google') {
  if (!output || typeof output !== 'object') return []
  const record = output as Record<string, unknown>
  if (record.available === false || !Array.isArray(record.accounts)) return []
  const multipleAccounts = record.accounts.length > 1
  const rows: ChartRow[] = []
  for (const account of record.accounts as Array<Record<string, unknown>>) {
    if (!Array.isArray(account.campaigns)) continue
    for (const campaign of account.campaigns as Array<Record<string, unknown>>) {
      const inversion = toNumber(campaign.spend ?? campaign.cost)
      const resultados = platform === 'meta'
        ? toNumber(campaign.results ?? campaign.leads)
        : toNumber(campaign.leads ?? campaign.conversions)
      if (inversion <= 0 && resultados <= 0) continue
      const baseName = cleanName(campaign.name ?? campaign.campaign_name)
      const name = multipleAccounts && typeof account.account_name === 'string'
        ? cleanName(`${baseName} (${account.account_name})`)
        : baseName
      rows.push({ name, inversion: Math.round(inversion * 100) / 100, resultados })
    }
  }
  return rows
}

function topWithOthers(rows: ChartRow[]) {
  const sorted = [...rows].sort((a, b) => b.inversion - a.inversion)
  if (sorted.length <= MAX_ITEMS) return sorted
  const top = sorted.slice(0, MAX_ITEMS - 1)
  const rest = sorted.slice(MAX_ITEMS - 1)
  top.push({
    name: `Otros (${rest.length})`,
    inversion: Math.round(rest.reduce((sum, row) => sum + row.inversion, 0) * 100) / 100,
    resultados: rest.reduce((sum, row) => sum + row.resultados, 0),
  })
  return top
}

function chartBlock(config: Record<string, unknown>) {
  return `\`\`\`chart\n${JSON.stringify(config)}\n\`\`\``
}

/**
 * o4-mini frecuentemente ignora la instrucción de emitir bloques ```chart.
 * Como respaldo determinístico, armamos los gráficos a partir de los
 * resultados reales de las tools de pauta ejecutadas en el turno.
 */
export function buildAutoCharts(steps: StepLike[]) {
  const byPlatform: Record<'meta' | 'google', ChartRow[]> = { meta: [], google: [] }
  for (const step of steps) {
    for (const result of step.toolResults ?? []) {
      if (result.toolName === 'get_meta_metrics') byPlatform.meta.push(...collectCampaigns(result.output, 'meta'))
      if (result.toolName === 'get_google_metrics') byPlatform.google.push(...collectCampaigns(result.output, 'google'))
    }
  }

  const blocks: string[] = []
  const labels = { meta: 'Meta Ads', google: 'Google Ads' }
  for (const platform of ['meta', 'google'] as const) {
    const rows = byPlatform[platform]
    if (rows.length < 2) continue
    const data = topWithOthers(rows)
    blocks.push(chartBlock({
      type: 'bar',
      layout: 'horizontal',
      title: `Inversión por campaña · ${labels[platform]}`,
      xKey: 'name',
      yKey: 'inversion',
      format: 'currency',
      data,
    }))
    if (data.some((row) => row.resultados > 0)) {
      blocks.push(chartBlock({
        type: 'bar',
        layout: 'horizontal',
        title: `Resultados por campaña · ${labels[platform]}`,
        xKey: 'name',
        yKey: 'resultados',
        format: 'number',
        data: [...data].sort((a, b) => b.resultados - a.resultados),
      }))
    }
  }

  const metaSpend = byPlatform.meta.reduce((sum, row) => sum + row.inversion, 0)
  const googleSpend = byPlatform.google.reduce((sum, row) => sum + row.inversion, 0)
  if (metaSpend > 0 && googleSpend > 0) {
    blocks.unshift(chartBlock({
      type: 'pie',
      title: 'Distribución de inversión por plataforma',
      xKey: 'name',
      yKey: 'value',
      format: 'currency',
      data: [
        { name: 'Meta Ads', value: Math.round(metaSpend * 100) / 100 },
        { name: 'Google Ads', value: Math.round(googleSpend * 100) / 100 },
      ],
    }))
  }

  return blocks.slice(0, 3)
}
