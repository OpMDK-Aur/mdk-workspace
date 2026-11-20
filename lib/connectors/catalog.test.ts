import { describe, expect, it } from 'vitest'
import { buildConnectorStatuses, connectorAnchor, CONNECTORS } from './catalog'
import { safeReturnPath } from '../google/return-path'

const now = new Date('2026-11-20T12:00:00Z').getTime()
const status = (rows: Parameters<typeof buildConnectorStatuses>[0], id: string) => buildConnectorStatuses(rows, null, now).find((item) => item.id === id)!

describe('buildConnectorStatuses', () => {
  it('marca desconectado cuando el usuario no tiene fila', () => {
    expect(status([], 'google_ads')).toMatchObject({ connected: false, email: null })
  })

  it('usa la conexión más reciente del usuario', () => {
    const result = status([
      { plataforma: 'google_sheets', email_conectado: 'vieja@x.com', token_expiry: null, updated_at: '2026-01-01T00:00:00Z', has_refresh_token: true },
      { plataforma: 'google_sheets', email_conectado: 'nueva@x.com', token_expiry: null, updated_at: '2026-10-01T00:00:00Z', has_refresh_token: true },
    ], 'google_sheets')
    expect(result).toMatchObject({ connected: true, email: 'nueva@x.com', expired: false })
  })

  it('solo considera vencido un token sin refresh token', () => {
    const expiredRow = { plataforma: 'google_docs', email_conectado: 'a@x.com', token_expiry: '2026-11-19T00:00:00Z', updated_at: null }
    expect(status([{ ...expiredRow, has_refresh_token: false }], 'google_docs').expired).toBe(true)
    expect(status([{ ...expiredRow, has_refresh_token: true }], 'google_docs').expired).toBe(false)
  })

  it('toma Discord de colaboradores', () => {
    const discord = buildConnectorStatuses([], { discord_id: '1', discord_username: 'erika' }, now).find((item) => item.id === 'discord')
    expect(discord).toMatchObject({ connected: true, email: 'erika' })
  })
})

describe('safeReturnPath', () => {
  it('acepta solo rutas internas', () => {
    expect(safeReturnPath('/dashboard/platform?cliente=1')).toBe('/dashboard/platform?cliente=1')
    expect(safeReturnPath('https://evil.com')).toBeNull()
    expect(safeReturnPath('//evil.com')).toBeNull()
    expect(safeReturnPath('/\\evil.com')).toBeNull()
  })
})

describe('connectorAnchor', () => {
  it('no usa "ads" en el id para que los bloqueadores no oculten la tarjeta', () => {
    expect(connectorAnchor('google_ads')).toBe('conector-google-campanas')
    expect(connectorAnchor('google_analytics')).toBe('conector-google-analytics')
    for (const connector of CONNECTORS) expect(connectorAnchor(connector.id)).not.toMatch(/ads\b|_ads|-ads/i)
  })
})
