import { adminOrderUpdateSchema, orderStatuses } from '@ecom/shared'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../../auth.js'
import { adminGetOrder, adminListOrders, adminUpdateOrderStatus } from '../../services/orders.js'

const adminOrdersQuerySchema = z.object({
  status: z.enum(orderStatuses).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export default async function adminOrdersRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/admin/orders', { preHandler: requireAdmin }, async (request) => {
    const query = adminOrdersQuerySchema.parse(request.query)
    return adminListOrders(query)
  })

  fastify.get<{ Params: { id: string } }>('/admin/orders/:id', { preHandler: requireAdmin }, async (request) => {
    return adminGetOrder(request.params.id)
  })

  fastify.patch<{ Params: { id: string } }>('/admin/orders/:id', { preHandler: requireAdmin }, async (request) => {
    const body = adminOrderUpdateSchema.parse(request.body)
    return adminUpdateOrderStatus(request.params.id, body.status)
  })
}
