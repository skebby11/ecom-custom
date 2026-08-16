import type { FastifyInstance } from 'fastify'
import { requireAdmin } from '../../auth.js'
import { getAdminStats } from '../../services/orders.js'

export default async function adminStatsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/admin/stats', { preHandler: requireAdmin }, async () => getAdminStats())
}
