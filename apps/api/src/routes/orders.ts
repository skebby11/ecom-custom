import type { FastifyInstance } from 'fastify'
import { notFound } from '../errors.js'
import { getOrderForCustomer } from '../services/orders.js'

export default async function ordersRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { id: string }; Querystring: { token?: string } }>('/orders/:id', async (request) => {
    const token = request.query.token
    if (!token) throw notFound('Ordine non trovato')
    return getOrderForCustomer(request.params.id, token)
  })
}
