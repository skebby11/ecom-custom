import { getDb, webhookEvents } from '@ecom/db'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type Stripe from 'stripe'
import { env } from '../env.js'
import { getStripe } from '../lib/stripe.js'
import { markOrderFailed, markOrderPaid } from '../services/orders.js'

function extractOrderId(obj: { metadata?: Stripe.Metadata | null; client_reference_id?: string | null }): string | null {
  return obj.metadata?.orderId ?? obj.client_reference_id ?? null
}

export default async function webhooksRoutes(fastify: FastifyInstance): Promise<void> {
  // Il body deve arrivare come Buffer grezzo per verificare la firma Stripe: questo
  // parser sovrascrive quello globale SOLO per le rotte registrate in questo plugin
  // (l'incapsulamento di Fastify lo isola dal resto dell'app).
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body)
  })

  fastify.post('/webhooks/stripe', async (request, reply) => {
    const stripe = getStripe()
    const rawBody = request.body as Buffer
    const signature = request.headers['stripe-signature']

    let event: Stripe.Event
    if (stripe && env.STRIPE_WEBHOOK_SECRET && typeof signature === 'string') {
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET)
      } catch (err) {
        request.log.warn({ err }, 'firma webhook Stripe non valida')
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Firma webhook non valida', details: null } })
      }
    } else {
      // nessun segreto configurato (tipicamente in sviluppo locale): si accetta il body così com'è
      event = JSON.parse(rawBody.toString('utf8')) as Stripe.Event
    }

    const db = getDb()
    const [already] = await db.select({ id: webhookEvents.id }).from(webhookEvents).where(eq(webhookEvents.id, event.id)).limit(1)
    if (already) {
      return reply.send({ received: true })
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const orderId = extractOrderId(session)
        if (orderId) {
          const paymentIntentId =
            typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? null)
          await markOrderPaid(orderId, paymentIntentId)
        }
        break
      }
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session
        const orderId = extractOrderId(session)
        if (orderId) await markOrderFailed(orderId)
        break
      }
      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        const orderId = extractOrderId(paymentIntent)
        if (orderId) await markOrderFailed(orderId)
        break
      }
      default:
        // eventi non gestiti: si risponde comunque 200
        break
    }

    await db.insert(webhookEvents).values({ id: event.id, type: event.type })
    return reply.send({ received: true })
  })
}
