import type { FastifyInstance } from 'fastify'
import { notFound } from '../errors.js'
import { getCollectionBySlug, listCollections } from '../services/catalog.js'

export default async function collectionsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/collections', async () => listCollections())

  fastify.get<{ Params: { slug: string } }>('/collections/:slug', async (request) => {
    const collection = await getCollectionBySlug(request.params.slug)
    if (!collection) throw notFound('Collezione non trovata')
    return collection
  })
}
