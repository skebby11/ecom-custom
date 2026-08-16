import { checkoutSessionSchema } from '@ecom/shared'
import type { FastifyInstance } from 'fastify'
import { beginCheckout } from '../services/orders.js'

export default async function checkoutRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/checkout/session', async (request) => {
    const body = checkoutSessionSchema.parse(request.body)
    return beginCheckout(body)
  })
}
