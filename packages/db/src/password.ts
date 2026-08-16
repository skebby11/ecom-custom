import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * Hashing password con `scrypt` (node:crypto), versione sincrona.
 * Usato solo al login admin e nello script di seed: il costo sincrono è accettabile.
 *
 * Formato salvato: `scrypt$<salt hex>$<hash hex>`
 */
const SALT_BYTES = 16
const KEY_LENGTH = 64
const SCHEME = 'scrypt'

/** Genera l'hash di una password in chiaro. */
export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_BYTES)
  const derived = scryptSync(plain, salt, KEY_LENGTH)
  return `${SCHEME}$${salt.toString('hex')}$${derived.toString('hex')}`
}

/**
 * Verifica una password in chiaro contro un hash salvato.
 * Non lancia mai eccezioni: un formato non valido restituisce semplicemente `false`.
 */
export function verifyPassword(plain: string, stored: string): boolean {
  try {
    const parts = stored.split('$')
    if (parts.length !== 3) return false

    const [scheme, saltHex, hashHex] = parts
    if (scheme !== SCHEME || !saltHex || !hashHex) return false

    const salt = Buffer.from(saltHex, 'hex')
    const expected = Buffer.from(hashHex, 'hex')
    if (expected.length !== KEY_LENGTH) return false

    const actual = scryptSync(plain, salt, KEY_LENGTH)
    if (actual.length !== expected.length) return false

    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
