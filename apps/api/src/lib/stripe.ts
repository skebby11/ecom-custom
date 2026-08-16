import Stripe from 'stripe'
import { env, isStripeConfigured } from '../env.js'

let cachedClient: Stripe | null | undefined

/** Client Stripe lazy: `null` se `STRIPE_SECRET_KEY` manca o è ancora il placeholder. */
export function getStripe(): Stripe | null {
  if (cachedClient !== undefined) return cachedClient

  if (!isStripeConfigured() || !env.STRIPE_SECRET_KEY) {
    cachedClient = null
    return cachedClient
  }

  cachedClient = new Stripe(env.STRIPE_SECRET_KEY)
  return cachedClient
}
