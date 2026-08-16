import { addToCartSchema, updateCartItemSchema } from '@ecom/shared'
import type { FastifyInstance } from 'fastify'
import { parseIntParam } from '../errors.js'
import { addCartItem, createCart, getCartOrThrow, removeCartItem, updateCartItem } from '../services/cart.js'

export default async function cartRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/cart', async (_request, reply) => {
    reply.status(201)
    return createCart()
  })

  fastify.get<{ Params: { id: string } }>('/cart/:id', async (request) => {
    return getCartOrThrow(request.params.id)
  })

  fastify.post<{ Params: { id: string } }>('/cart/:id/items', async (request) => {
    const body = addToCartSchema.parse(request.body)
    return addCartItem(request.params.id, body.variantId, body.qty)
  })

  fastify.patch<{ Params: { id: string; itemId: string } }>('/cart/:id/items/:itemId', async (request) => {
    const body = updateCartItemSchema.parse(request.body)
    const itemId = parseIntParam(request.params.itemId, 'Riga carrello non trovata')
    return updateCartItem(request.params.id, itemId, body.qty)
  })

  fastify.delete<{ Params: { id: string; itemId: string } }>('/cart/:id/items/:itemId', async (request) => {
    const itemId = parseIntParam(request.params.itemId, 'Riga carrello non trovata')
    return removeCartItem(request.params.id, itemId)
  })
}
