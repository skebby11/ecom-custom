import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import formbody from '@fastify/formbody'
import { getDb } from '@ecom/db'
import { sql } from 'drizzle-orm'
import Fastify from 'fastify'
import { env } from './env.js'
import { errorHandler } from './errors.js'
import adminAuthRoutes from './routes/admin/auth.js'
import adminCollectionsRoutes from './routes/admin/collections.js'
import adminOrdersRoutes from './routes/admin/orders.js'
import adminProductsRoutes from './routes/admin/products.js'
import adminStatsRoutes from './routes/admin/stats.js'
import cartRoutes from './routes/cart.js'
import checkoutRoutes from './routes/checkout.js'
import collectionsRoutes from './routes/collections.js'
import ordersRoutes from './routes/orders.js'
import productsRoutes from './routes/products.js'
import webhooksRoutes from './routes/webhooks.js'

export function buildApp() {
  const fastify = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport: env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
    },
  })

  // senza credentials:true i cookie di sessione admin non passerebbero al browser
  fastify.register(cors, {
    origin: [...new Set([env.PUBLIC_SITE_URL, 'http://localhost:4321'])],
    credentials: true,
  })
  fastify.register(cookie)
  fastify.register(formbody)

  fastify.register(productsRoutes, { prefix: '/api' })
  fastify.register(collectionsRoutes, { prefix: '/api' })
  fastify.register(cartRoutes, { prefix: '/api' })
  fastify.register(checkoutRoutes, { prefix: '/api' })
  fastify.register(ordersRoutes, { prefix: '/api' })
  fastify.register(webhooksRoutes, { prefix: '/api' })

  fastify.register(adminAuthRoutes, { prefix: '/api' })
  fastify.register(adminProductsRoutes, { prefix: '/api' })
  fastify.register(adminCollectionsRoutes, { prefix: '/api' })
  fastify.register(adminOrdersRoutes, { prefix: '/api' })
  fastify.register(adminStatsRoutes, { prefix: '/api' })

  fastify.get('/api/health', async (request, reply) => {
    const db = getDb()
    try {
      db.get(sql`select 1`)
      return { ok: true, db: true }
    } catch (err) {
      request.log.error(err)
      reply.status(503)
      return { ok: false, db: false }
    }
  })

  fastify.setErrorHandler<Error>(errorHandler)

  return fastify
}
