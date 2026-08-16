import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { adminSessions, adminUsers, getDb } from '@ecom/db'
import { eq, lt } from 'drizzle-orm'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { env } from './env.js'
import { AppError } from './errors.js'

declare module 'fastify' {
  interface FastifyRequest {
    /** popolato da `requireAdmin` dopo la verifica della sessione */
    adminUser?: { id: number; email: string; name: string | null }
  }
}

const SCRYPT_KEYLEN = 64
export const SESSION_COOKIE_NAME = 'admin_session'
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000

/** Formato persistito: `scrypt$<salt hex>$<hash hex>`. */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(plain, salt, SCRYPT_KEYLEN)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false

  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  // Buffer.from(hex) tronca silenziosamente su caratteri non esadecimali invece di
  // fallire: un hash memorizzato corrotto o troncato produrrebbe un buffer più corto,
  // scryptSync verrebbe chiamato con keylen 0 e la verifica passerebbe per qualunque
  // password. Si rifiuta subito qualunque cosa non abbia la lunghezza attesa.
  if (salt.length !== 16 || expected.length !== SCRYPT_KEYLEN) return false
  const actual = scryptSync(plain, salt, SCRYPT_KEYLEN)
  return timingSafeEqual(actual, expected)
}

/**
 * Hash fittizio con formato valido ma password impossibile da indovinare: usato per
 * far girare `verifyPassword` anche quando l'email non corrisponde a nessun utente,
 * così il tempo di risposta del login non rivela quali indirizzi esistono.
 */
export const DUMMY_PASSWORD_HASH = hashPassword(randomBytes(32).toString('hex'))

export async function createSession(userId: number): Promise<{ id: string; expiresAt: string }> {
  const db = getDb()
  // pulizia sessioni scadute ad ogni login, così la tabella non cresce indefinitamente
  await db.delete(adminSessions).where(lt(adminSessions.expiresAt, new Date().toISOString()))

  const id = randomUUID()
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString()
  await db.insert(adminSessions).values({ id, userId, expiresAt })
  return { id, expiresAt }
}

export function setSessionCookie(reply: FastifyReply, sessionId: string, expiresAt: string): void {
  reply.setCookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expiresAt),
  })
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' })
}

/** preHandler da applicare a tutte le rotte `/api/admin/*` tranne il login. */
export async function requireAdmin(request: FastifyRequest): Promise<void> {
  const sessionId = request.cookies[SESSION_COOKIE_NAME]
  if (!sessionId) throw new AppError(401, 'UNAUTHORIZED', 'Accesso riservato agli amministratori')

  const db = getDb()
  const [session] = await db.select().from(adminSessions).where(eq(adminSessions.id, sessionId)).limit(1)
  if (!session || session.expiresAt < new Date().toISOString()) {
    throw new AppError(401, 'UNAUTHORIZED', 'Sessione scaduta o non valida')
  }

  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, session.userId)).limit(1)
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Utente non trovato')

  request.adminUser = { id: user.id, email: user.email, name: user.name }
}
