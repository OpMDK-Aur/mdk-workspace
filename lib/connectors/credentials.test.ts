import { randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

// `server-only` falla fuera del bundler de Next; en los tests no aplica.
vi.mock('server-only', () => ({}))

import { decryptCredentials, encryptCredentials, InvalidEncryptionKeyError, MissingEncryptionKeyError, parseEncryptionKey } from './secrets'
import { verifyConnectorCredentials } from './verify'
import { buildConnectorStatuses, CREDENTIALS_UNVERIFIED_SCOPE } from './catalog'

const originalKey = process.env.CONNECTORS_ENCRYPTION_KEY
afterEach(() => { process.env.CONNECTORS_ENCRYPTION_KEY = originalKey })

describe('cifrado de credenciales', () => {
  it('cifra y descifra sin dejar el valor en texto plano', () => {
    process.env.CONNECTORS_ENCRYPTION_KEY = randomBytes(32).toString('base64')
    const stored = encryptCredentials({ token: 'secreto-123' })
    expect(stored).not.toContain('secreto-123')
    expect(decryptCredentials(stored)).toEqual({ token: 'secreto-123' })
  })

  it('no descifra con otra clave', () => {
    process.env.CONNECTORS_ENCRYPTION_KEY = randomBytes(32).toString('base64')
    const stored = encryptCredentials({ token: 'x' })
    process.env.CONNECTORS_ENCRYPTION_KEY = randomBytes(32).toString('hex')
    expect(() => decryptCredentials(stored)).toThrow()
  })

  it('exige la clave de cifrado', () => {
    delete process.env.CONNECTORS_ENCRYPTION_KEY
    expect(() => encryptCredentials({ token: 'x' })).toThrow(MissingEncryptionKeyError)
  })

  it('acepta 32 bytes en base64, base64url o hex', () => {
    const key = randomBytes(32)
    expect(parseEncryptionKey(key.toString('base64'))).toEqual(key)
    expect(parseEncryptionKey(key.toString('base64url'))).toEqual(key)
    expect(parseEncryptionKey(` ${key.toString('hex')}\n`)).toEqual(key)
  })

  it('rechaza contraseñas y claves de otro largo', () => {
    for (const value of ['clave-de-prueba', randomBytes(16).toString('base64'), randomBytes(48).toString('base64'), randomBytes(31).toString('hex')]) {
      expect(() => parseEncryptionKey(value)).toThrow(InvalidEncryptionKeyError)
    }
  })
})

describe('validación sin red', () => {
  it('rechaza URLs sin https en Tecnom', async () => {
    expect(await verifyConnectorCredentials('tecnom', { apiUrl: 'http://api.tecnom.com', token: 't' })).toMatchObject({ ok: false })
  })

  it('normaliza la URL de Fidelity', async () => {
    expect(await verifyConnectorCredentials('fidelity', { apiUrl: ' https://api.fidelity.com.ar/v1 ', username: '', token: 't ' })).toMatchObject({ ok: true, label: 'api.fidelity.com.ar', values: { token: 't' } })
  })

  it('rechaza subdominios inválidos de Kommo', async () => {
    expect(await verifyConnectorCredentials('kommo', { subdomain: 'mi empresa!', token: 't' })).toMatchObject({ ok: false })
  })

  it('exige un Advertiser ID numérico en TikTok', async () => {
    expect(await verifyConnectorCredentials('tiktok', { token: 't', advertiserId: 'abc' })).toMatchObject({ ok: false })
  })

  it('bloquea hosts internos en cPanel', async () => {
    expect(await verifyConnectorCredentials('donweb', { host: '127.0.0.1', username: 'u', token: 't' })).toMatchObject({ ok: false })
    expect(await verifyConnectorCredentials('donweb', { host: 'localhost', username: 'u', token: 't' })).toMatchObject({ ok: false })
  })
})

describe('estado de conectores con credenciales', () => {
  it('marca como no verificadas las guardadas sin prueba', () => {
    const [status] = buildConnectorStatuses([{ plataforma: 'tecnom', email_conectado: 'api.tecnom.com', token_expiry: null, updated_at: null, has_refresh_token: false, scope: CREDENTIALS_UNVERIFIED_SCOPE }], null).filter((item) => item.id === 'tecnom')
    expect(status).toMatchObject({ connected: true, verified: false })
  })
})
