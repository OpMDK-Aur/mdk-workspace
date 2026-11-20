import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const PREFIX = 'enc:v1:'
const KEY_BYTES = 32

export const ENCRYPTION_KEY_FORMAT_HELP = 'CONNECTORS_ENCRYPTION_KEY tiene que ser una clave aleatoria de 32 bytes en base64 (44 caracteres, por ejemplo la salida de `openssl rand -base64 32`) o en hex (64 caracteres, `openssl rand -hex 32`).'

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super('Falta configurar CONNECTORS_ENCRYPTION_KEY para guardar credenciales.')
  }
}

export class InvalidEncryptionKeyError extends Error {
  constructor() {
    super(ENCRYPTION_KEY_FORMAT_HELP)
  }
}

/**
 * Lee la clave AES-256 desde CONNECTORS_ENCRYPTION_KEY. Solo acepta 32 bytes
 * aleatorios codificados en hex o base64 (también base64url), para que una
 * contraseña corta o adivinable no se pueda usar como clave.
 */
export function parseEncryptionKey(raw: string | undefined): Buffer {
  const secret = raw?.trim()
  if (!secret) throw new MissingEncryptionKeyError()
  if (/^[0-9a-fA-F]{64}$/.test(secret)) return Buffer.from(secret, 'hex')
  if (/^[A-Za-z0-9+/_-]{43}={0,1}$/.test(secret)) {
    const key = Buffer.from(secret.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    if (key.length === KEY_BYTES) return key
  }
  throw new InvalidEncryptionKeyError()
}

function encryptionKey() {
  return parseEncryptionKey(process.env.CONNECTORS_ENCRYPTION_KEY)
}

/** Cifra las credenciales con AES-256-GCM antes de guardarlas en `plataformas_tokens.access_token`. */
export function encryptCredentials(values: Record<string, string>) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(values), 'utf8'), cipher.final()])
  return `${PREFIX}${[iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64')).join('.')}`
}

export function decryptCredentials(stored: string): Record<string, string> {
  if (!stored.startsWith(PREFIX)) throw new Error('Formato de credencial desconocido.')
  const [iv, tag, ciphertext] = stored.slice(PREFIX.length).split('.').map((part) => Buffer.from(part, 'base64'))
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv)
  decipher.setAuthTag(tag)
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'))
}
