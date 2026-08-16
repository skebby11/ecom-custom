import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../../auth.js'
import { parseIntParam } from '../../errors.js'
import { adminCreateCollection, adminDeleteCollection, adminListCollections, adminUpdateCollection } from '../../services/catalog.js'

const collectionInputSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug non valido (usa lettere minuscole e trattini)'),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
})

export default async function adminCollectionsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/admin/collections', { preHandler: requireAdmin }, async () => adminListCollections())

  fastify.post('/admin/collections', { preHandler: requireAdmin }, async (request, reply) => {
    const body = collectionInputSchema.parse(request.body)
    const collection = await adminCreateCollection(body)
    reply.status(201)
    return collection
  })

  fastify.put<{ Params: { id: string } }>('/admin/collections/:id', { preHandler: requireAdmin }, async (request) => {
    const id = parseIntParam(request.params.id, 'Collezione non trovata')
    const body = collectionInputSchema.parse(request.body)
    return adminUpdateCollection(id, body)
  })

  fastify.delete<{ Params: { id: string } }>('/admin/collections/:id', { preHandler: requireAdmin }, async (request) => {
    const id = parseIntParam(request.params.id, 'Collezione non trovata')
    await adminDeleteCollection(id)
    return { ok: true }
  })
}
