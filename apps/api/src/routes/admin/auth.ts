import { adminSessions, adminUsers, getDb } from '@ecom/db'
import { loginSchema } from '@ecom/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  createSession,
  requireAdmin,
  setSessionCookie,
  verifyPassword,
} from '../../auth.js'
import { unauthorized } from '../../errors.js'

export default async function adminAuthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/admin/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)
    const db = getDb()

    const [user] = await db.select().from(adminUsers).where(eq(adminUsers.email, body.email)).limit(1)
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      throw unauthorized('Credenziali non valide')
    }

    const session = await createSession(user.id)
    setSessionCookie(reply, session.id, session.expiresAt)
    return { user: { id: user.id, email: user.email, name: user.name } }
  })

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
