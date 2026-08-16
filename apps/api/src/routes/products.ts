import { productQuerySchema } from '@ecom/shared'
import type { FastifyInstance } from 'fastify'
import { notFound } from '../errors.js'
import { getProductDetailBySlug, listProducts } from '../services/catalog.js'

export default async function productsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/products', async (request) => {
    const query = productQuerySchema.parse(request.query)
    return listProducts(query)
  })

  fastify.get<{ Params: { slug: string } }>('/products/:slug', async (request) => {
    const product = await getProductDetailBySlug(request.params.slug)
    if (!product) throw notFound('Prodotto non trovato')
    return product
  })
}
