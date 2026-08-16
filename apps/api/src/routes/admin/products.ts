import { adminProductInputSchema, productStatuses } from '@ecom/shared'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../../auth.js'
import { notFound, parseIntParam } from '../../errors.js'
import { adminCreateProduct, adminDeleteProduct, adminGetProductById, adminListProducts, adminReplaceProduct } from '../../services/catalog.js'

const adminProductsQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(productStatuses).optional(),
})

export default async function adminProductsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/admin/products', { preHandler: requireAdmin }, async (request) => {
    const query = adminProductsQuerySchema.parse(request.query)
    return adminListProducts(query)
  })

  fastify.get<{ Params: { id: string } }>('/admin/products/:id', { preHandler: requireAdmin }, async (request) => {
    const id = parseIntParam(request.params.id, 'Prodotto non trovato')
    const product = await adminGetProductById(id)
    if (!product) throw notFound('Prodotto non trovato')
    return product
  })

  fastify.post('/admin/products', { preHandler: requireAdmin }, async (request, reply) => {
    const body = adminProductInputSchema.parse(request.body)
    const product = await adminCreateProduct(body)
    reply.status(201)
    return product
  })

  fastify.put<{ Params: { id: string } }>('/admin/products/:id', { preHandler: requireAdmin }, async (request) => {
    const id = parseIntParam(request.params.id, 'Prodotto non trovato')
    const body = adminProductInputSchema.parse(request.body)
    return adminReplaceProduct(id, body)
  })

  fastify.delete<{ Params: { id: string } }>('/admin/products/:id', { preHandler: requireAdmin }, async (request) => {
    const id = parseIntParam(request.params.id, 'Prodotto non trovato')
    await adminDeleteProduct(id)
    return { ok: true }
  })
}
