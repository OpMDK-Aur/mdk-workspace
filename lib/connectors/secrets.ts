import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const PREFIX = 'enc:v1:'

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super('Falta configurar CONNECTORS_ENCRYPTION_KEY para guardar credenciales.')
  }
}

function encryptionKey() {
  const secret = process.env.CONNECTORS_ENCRYPTION_KEY?.trim()
  if (!secret) throw new MissingEncryptionKeyError()
  return createHash('sha256').update(secret).digest()
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
