import type { APIRoute } from 'astro'
import { checkoutSessionSchema } from '@ecom/shared'
import { ApiError, apiFetch } from '~/lib/api'
import { errorResponse, jsonResponse } from '~/lib/route-response'

/**
 * Proxy same-origin verso `/api/checkout/session`. Il form di checkout.astro
 * chiama questa rotta invece dell'API direttamente: così il browser non deve
 * mai conoscere `PUBLIC_API_URL` per inviare email/indirizzo di spedizione, e
 * non esiste un fallback a `localhost` lato client da poter sfruttare o da cui
 * dipendere silenziosamente se la variabile non è configurata in produzione.
 */
export const POST: APIRoute = async ({ request }) => {
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return errorResponse(400, 'VALIDATION_ERROR', 'Corpo della richiesta non valido')
  }

  const parsed = checkoutSessionSchema.safeParse(rawBody)
  if (!parsed.success) {
    return errorResponse(400, 'VALIDATION_ERROR', 'Dati di checkout non validi')
  }

  try {
    const session = await apiFetch<{ url: string; orderId: string; token: string }>('/api/checkout/session', {
      method: 'POST',
      body: JSON.stringify(parsed.data),
    })
    return jsonResponse(session)
  } catch (err) {
    if (err instanceof ApiError) {
      // Include STRIPE_NOT_CONFIGURED (503): comportamento voluto in sviluppo
      // senza chiavi Stripe, non un errore da mascherare con un fallback finto.
      return errorResponse(err.status, err.code, err.message)
    }
    console.error('[api/checkout] errore imprevisto', err)
    return errorResponse(500, 'INTERNAL_ERROR', 'Errore interno, riprova')
  }
}
