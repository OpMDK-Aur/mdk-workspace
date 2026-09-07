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
