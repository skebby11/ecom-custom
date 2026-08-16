import rateLimit from '@fastify/rate-limit'
import { adminSessions, adminUsers, getDb } from '@ecom/db'
import { loginSchema } from '@ecom/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  DUMMY_PASSWORD_HASH,
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  createSession,
  requireAdmin,
  setSessionCookie,
  verifyPassword,
} from '../../auth.js'
import { unauthorized } from '../../errors.js'

export default async function adminAuthRoutes(fastify: FastifyInstance): Promise<void> {
  // registrato solo in questo plugin: l'incapsulamento di Fastify lo isola dal resto
  // dell'app, così non serve applicarlo alle rotte pubbliche del catalogo
  await fastify.register(rateLimit, { max: 100, timeWindow: '1 minute' })

  fastify.post(
    '/admin/login',
    // limite più stretto solo sul login: protegge dal brute-force sulla password
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = loginSchema.parse(request.body)
      const db = getDb()

      const [user] = await db.select().from(adminUsers).where(eq(adminUsers.email, body.email)).limit(1)
      // hash fittizio quando l'utente non esiste: scrypt gira comunque, così il tempo
      // di risposta non rivela quali indirizzi email corrispondono a un account
      const passwordOk = verifyPassword(body.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH)
      if (!user || !passwordOk) {
        throw unauthorized('Credenziali non valide')
      }

      const session = await createSession(user.id)
      setSessionCookie(reply, session.id, session.expiresAt)
      return { user: { id: user.id, email: user.email, name: user.name } }
    }
  )

  fastify.post('/admin/logout', { preHandler: requireAdmin }, async (request, reply) => {
    const db = getDb()
    const sessionId = request.cookies[SESSION_COOKIE_NAME]
    if (sessionId) await db.delete(adminSessions).where(eq(adminSessions.id, sessionId))
    clearSessionCookie(reply)
    return { ok: true }
  })

  fastify.get('/admin/me', { preHandler: requireAdmin }, async (request) => {
    return { user: request.adminUser }
  })
}
