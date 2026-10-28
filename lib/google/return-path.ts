// Solo rutas internas: evita open redirects vía el parámetro state del OAuth.
export function safeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null
  return value.slice(0, 300)
}
