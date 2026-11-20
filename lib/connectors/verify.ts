import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import type { ConnectorId } from './catalog'

export type VerifyResult = { ok: true; label: string; values: Record<string, string> } | { ok: false; error: string }

const TIMEOUT_MS = 10_000

async function getJson(url: string, headers: Record<string, string>) {
  const response = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store', redirect: 'error' })
  const body = await response.json().catch(() => null)
  return { status: response.status, ok: response.ok, body: body as Record<string, any> | null }
}

const rejected = (status: number, provider: string) =>
  status === 400 || status === 401 || status === 403
    ? `${provider} rechazó las credenciales. Revisá que estén bien copiadas y tengan permisos.`
    : `${provider} respondió con un error (${status}). Probá de nuevo en un rato.`

/** Bloquea hosts internos para que el formulario no se pueda usar para hacer requests a la red privada. */
async function assertPublicHost(host: string) {
  if (!/^(?=.{1,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i.test(host) || isIP(host)) throw new Error('Ingresá un dominio válido, por ejemplo tudominio.com.')
  const addresses = await lookup(host, { all: true }).catch(() => [])
  if (!addresses.length) throw new Error('No se encontró el servidor. Revisá el dominio.')
  const isPrivate = (address: string) =>
    /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(address) ||
    address === '::1' || /^f[cd]/i.test(address) || /^fe80/i.test(address) || address.startsWith('::ffff:127.')
  if (addresses.some(({ address }) => isPrivate(address))) throw new Error('Ese servidor no es accesible desde internet.')
}

/** Prueba usuario y contraseña con AUTH LOGIN en el SMTP de Hostinger (puerto 465, TLS). */
function verifySmtpLogin(host: string, user: string, password: string) {
  return new Promise<boolean>((resolve, reject) => {
    const socket = tlsConnect({ host, port: 465, servername: host })
    const steps = [`EHLO madketing.io`, 'AUTH LOGIN', Buffer.from(user).toString('base64'), Buffer.from(password).toString('base64')]
    let buffer = ''
    let step = -1
    const finish = (error: Error | null, value = false) => {
      clearTimeout(timer)
      socket.end('QUIT\r\n')
      socket.destroy()
      if (error) reject(error)
      else resolve(value)
    }
    const timer = setTimeout(() => finish(new Error('El servidor de correo no respondió a tiempo.')), TIMEOUT_MS)
    socket.on('error', () => finish(new Error('No se pudo conectar al servidor de correo.')))
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      const lines = buffer.split('\r\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (/^\d{3}-/.test(line)) continue
        const code = Number(line.slice(0, 3))
        if (code === 235) return finish(null, true)
        if (code === 535 || code === 534) return finish(null, false)
        if (code >= 400) return finish(new Error('El servidor de correo rechazó la conexión.'))
        step += 1
        if (step < steps.length) socket.write(`${steps[step]}\r\n`)
      }
    })
  })
}

const normalizeHost = (value: string) => value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[:/].*$/, '')

function assertHttpsUrl(value: string) {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('La URL no es válida.')
  }
  if (url.protocol !== 'https:') throw new Error('La URL tiene que empezar con https://.')
  return url
}

/**
 * Prueba las credenciales contra la API del proveedor y devuelve los valores
 * normalizados que se guardan. Los conectores sin API pública conocida
 * (Aurelia, Fidelity, Tecnom) solo se validan en formato.
 */
export async function verifyConnectorCredentials(id: ConnectorId, input: Record<string, string>): Promise<VerifyResult> {
  try {
    switch (id) {
      case 'gohighlevel': {
        const locationId = input.locationId.trim()
        const result = await getJson(`https://services.leadconnectorhq.com/locations/${encodeURIComponent(locationId)}`, { Authorization: `Bearer ${input.token.trim()}`, Version: '2021-07-28' })
        if (!result.ok) return { ok: false, error: rejected(result.status, 'GoHighLevel') }
        return { ok: true, label: result.body?.location?.name ?? `Location ${locationId}`, values: { token: input.token.trim(), locationId } }
      }
      case 'kommo': {
        const subdomain = input.subdomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\.kommo\.com.*$/, '')
        if (!/^[a-z0-9-]{2,63}$/.test(subdomain)) return { ok: false, error: 'El subdominio solo puede tener letras, números y guiones.' }
        const result = await getJson(`https://${subdomain}.kommo.com/api/v4/account`, { Authorization: `Bearer ${input.token.trim()}` })
        if (!result.ok) return { ok: false, error: rejected(result.status, 'Kommo') }
        return { ok: true, label: result.body?.name ? `${result.body.name} (${subdomain}.kommo.com)` : `${subdomain}.kommo.com`, values: { subdomain, token: input.token.trim() } }
      }
      case 'hubspot': {
        const result = await getJson('https://api.hubapi.com/account-info/v3/details', { Authorization: `Bearer ${input.token.trim()}` })
        if (!result.ok) return { ok: false, error: rejected(result.status, 'HubSpot') }
        return { ok: true, label: result.body?.portalId ? `Portal ${result.body.portalId}` : 'Cuenta de HubSpot', values: { token: input.token.trim() } }
      }
      case 'hostinger': {
        const result = await getJson('https://developers.hostinger.com/api/domains/v1/portfolio', { Authorization: `Bearer ${input.token.trim()}` })
        if (!result.ok) return { ok: false, error: rejected(result.status, 'Hostinger') }
        const count = Array.isArray(result.body) ? result.body.length : Array.isArray(result.body?.data) ? result.body.data.length : null
        return { ok: true, label: count === null ? 'API de Hostinger' : `${count} dominios`, values: { token: input.token.trim() } }
      }
      case 'hostinger_email': {
        const email = input.email.trim().toLowerCase()
        const valid = await verifySmtpLogin('smtp.hostinger.com', email, input.password)
        if (!valid) return { ok: false, error: 'Hostinger rechazó el email o la contraseña.' }
        return { ok: true, label: email, values: { email, password: input.password, imapHost: 'imap.hostinger.com', smtpHost: 'smtp.hostinger.com' } }
      }
      case 'donweb': {
        const host = normalizeHost(input.host)
        const username = input.username.trim()
        await assertPublicHost(host)
        const result = await getJson(`https://${host}:2083/execute/Variables/get_user_information`, { Authorization: `cpanel ${username}:${input.token.trim()}` })
        if (!result.ok || result.body?.status === 0) return { ok: false, error: result.ok ? 'cPanel rechazó el usuario o el token.' : rejected(result.status, 'cPanel') }
        return { ok: true, label: `${username}@${host}`, values: { host, username, token: input.token.trim() } }
      }
      case 'cloudflare': {
        const headers = { Authorization: `Bearer ${input.token.trim()}` }
        let result = await getJson('https://api.cloudflare.com/client/v4/user/tokens/verify', headers)
        // Los tokens de cuenta no pasan por /user/tokens/verify; se prueban listando una zona.
        if (!result.ok) result = await getJson('https://api.cloudflare.com/client/v4/zones?per_page=1', headers)
        if (!result.ok || result.body?.success === false) return { ok: false, error: rejected(result.status || 401, 'Cloudflare') }
        return { ok: true, label: 'Token activo', values: { token: input.token.trim() } }
      }
      case 'fidelity':
      case 'tecnom': {
        const url = assertHttpsUrl(input.apiUrl)
        const values = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value.trim()]))
        return { ok: true, label: url.host, values: { ...values, apiUrl: url.toString() } }
      }
      case 'aurelia_crm':
        return { ok: true, label: `Cuenta ${input.accountId.trim()}`, values: { accountId: input.accountId.trim(), token: input.token.trim() } }
      default:
        return { ok: false, error: 'Este conector no usa credenciales.' }
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') return { ok: false, error: 'El proveedor no respondió a tiempo. Probá de nuevo.' }
    if (error instanceof TypeError) return { ok: false, error: 'No se pudo conectar con el proveedor. Revisá los datos del servidor.' }
    return { ok: false, error: error instanceof Error ? error.message : 'No se pudieron verificar las credenciales.' }
  }
}
