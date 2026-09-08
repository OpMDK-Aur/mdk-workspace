import { google } from 'googleapis'

export type GoogleAnalyticsSales = {
  propertyId: string
  dateRange: { start: string; end: string }
  purchaseEvents: number
  transactions: number
  revenue: number
  currency: string | null
  byDay: Array<{ date: string; purchases: number; transactions: number; revenue: number }>
}

function createAuth() {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN })
  return auth
}

export type GoogleAnalyticsReport = {
  propertyId: string
  dateRange: { start: string; end: string }
  reports: {
    overview: Array<Record<string, string | number>>
    events: Array<Record<string, string | number>>
    acquisition: Array<Record<string, string | number>>
    pages: Array<Record<string, string | number>>
    devices: Array<Record<string, string | number>>
    geography: Array<Record<string, string | number>>
    keyEventsByChannel: Array<Record<string, string | number>>
    byDay: Array<Record<string, string | number>>
  }
  errors: Array<{ report: string; message: string }>
}

function rowsToRecords(response: { data: { dimensionHeaders?: Array<{ name?: string | null }>; metricHeaders?: Array<{ name?: string | null }>; rows?: Array<{ dimensionValues?: Array<{ value?: string | null }>; metricValues?: Array<{ value?: string | null }> }> } }) {
  const dimensions = (response.data.dimensionHeaders ?? []).map((header) => header.name ?? 'dimension')
  const metrics = (response.data.metricHeaders ?? []).map((header) => header.name ?? 'metric')
  return (response.data.rows ?? []).slice(0, 100).map((row) => Object.fromEntries([
    ...dimensions.map((name, index) => [name, row.dimensionValues?.[index]?.value ?? '']),
    ...metrics.map((name, index) => {
      const value = row.metricValues?.[index]?.value ?? '0'
      const numeric = Number(value)
      return [name, Number.isNaN(numeric) ? value : numeric]
    }),
  ]))
}

export async function getGoogleAnalyticsReport(propertyId: string, dateFrom: string, dateTo: string): Promise<GoogleAnalyticsReport> {
  const normalizedProperty = propertyId.replace(/^properties\//, '')
  if (!/^\d+$/.test(normalizedProperty)) throw new Error('La propiedad de Google Analytics no tiene un ID válido.')
  const analyticsData = google.analyticsdata({ version: 'v1beta', auth: createAuth() })
  const base = { dateRanges: [{ startDate: dateFrom, endDate: dateTo }] }
  const definitions = {
    overview: { dimensions: [], metrics: ['activeUsers', 'newUsers', 'sessions', 'engagedSessions', 'engagementRate', 'eventCount', 'keyEvents', 'totalUsers', 'totalRevenue', 'purchaseRevenue', 'ecommercePurchases'] },
    events: { dimensions: ['eventName'], metrics: ['eventCount', 'keyEvents', 'totalUsers', 'eventValue', 'totalRevenue', 'purchaseRevenue', 'ecommercePurchases'] },
    acquisition: { dimensions: ['firstUserDefaultChannelGroup', 'sessionSourceMedium'], metrics: ['activeUsers', 'newUsers', 'sessions', 'engagedSessions', 'engagementRate', 'eventCount', 'keyEvents', 'totalRevenue', 'purchaseRevenue', 'ecommercePurchases'] },
    keyEventsByChannel: { dimensions: ['firstUserDefaultChannelGroup', 'sessionSourceMedium'], metrics: ['keyEvents'] },
    pages: { dimensions: ['pageTitle', 'pagePath', 'landingPagePlusQueryString'], metrics: ['screenPageViews', 'activeUsers', 'sessions', 'engagedSessions', 'engagementRate', 'eventCount', 'keyEvents', 'totalRevenue', 'purchaseRevenue'] },
    devices: { dimensions: ['deviceCategory', 'operatingSystem'], metrics: ['activeUsers', 'sessions', 'engagedSessions', 'engagementRate', 'eventCount', 'keyEvents', 'totalRevenue'] },
    geography: { dimensions: ['country', 'city'], metrics: ['activeUsers', 'sessions', 'engagedSessions', 'engagementRate', 'eventCount', 'keyEvents', 'totalRevenue', 'purchaseRevenue'] },
    byDay: { dimensions: ['date'], metrics: ['activeUsers', 'newUsers', 'sessions', 'engagedSessions', 'eventCount', 'keyEvents', 'totalRevenue', 'purchaseRevenue', 'ecommercePurchases'] },
  } as const
  const entries = Object.entries(definitions)
  const results = await Promise.allSettled(entries.map(async ([name, definition]) => {
    const response = await analyticsData.properties.runReport({
      property: `properties/${normalizedProperty}`,
      requestBody: { ...base, dimensions: definition.dimensions.map((dimension) => ({ name: dimension })), metrics: definition.metrics.map((metric) => ({ name: metric })), limit: '100' },
    })
    return [name, rowsToRecords(response)] as const
  }))
  const reports: GoogleAnalyticsReport['reports'] = { overview: [], events: [], acquisition: [], pages: [], devices: [], geography: [], keyEventsByChannel: [], byDay: [] }
  const errors: GoogleAnalyticsReport['errors'] = []
  results.forEach((result, index) => {
    const name = entries[index][0] as keyof GoogleAnalyticsReport['reports']
    if (result.status === 'fulfilled') reports[name] = result.value[1]
    else errors.push({ report: name, message: result.reason instanceof Error ? result.reason.message : 'No se pudo consultar este reporte de GA4.' })
  })
  return { propertyId: normalizedProperty, dateRange: { start: dateFrom, end: dateTo }, reports, errors }
}

export async function getGoogleAnalyticsSales(propertyId: string, dateFrom: string, dateTo: string): Promise<GoogleAnalyticsSales> {
  const normalizedProperty = propertyId.replace(/^properties\//, '')
  if (!/^\d+$/.test(normalizedProperty)) throw new Error('La propiedad de Google Analytics no tiene un ID válido.')
  const analyticsData = google.analyticsdata({ version: 'v1beta', auth: createAuth() })
  const response = await analyticsData.properties.runReport({
    property: `properties/${normalizedProperty}`,
    requestBody: {
      dateRanges: [{ startDate: dateFrom, endDate: dateTo }],
      dimensions: [{ name: 'date' }],
      metrics: [
        { name: 'eventCount' },
        { name: 'ecommercePurchases' },
        { name: 'purchaseRevenue' },
      ],
      dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'purchase' } } },
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    },
  })
  const rows = response.data.rows ?? []
  const byDay = rows.map(row => ({
    date: row.dimensionValues?.[0]?.value ?? '',
    purchases: Number(row.metricValues?.[0]?.value ?? 0),
    transactions: Number(row.metricValues?.[1]?.value ?? 0),
    revenue: Number(row.metricValues?.[2]?.value ?? 0),
  }))
  return {
    propertyId: normalizedProperty,
    dateRange: { start: dateFrom, end: dateTo },
    purchaseEvents: byDay.reduce((sum, row) => sum + row.purchases, 0),
    transactions: byDay.reduce((sum, row) => sum + row.transactions, 0),
    revenue: byDay.reduce((sum, row) => sum + row.revenue, 0),
    currency: null,
    byDay,
  }
}
