import type { APIRoute } from 'astro'
import { ApiError, api } from '~/lib/api'
import { errorResponse, jsonResponse } from '~/lib/route-response'

/**
 * Proxy same-origin per il polling dello stato ordine da ordine/[id].astro:
 * il browser non deve conoscere `PUBLIC_API_URL` né inviargli l'access token
 * dell'ordine, e non esiste un fallback a `localhost` lato client.
 */
export const GET: APIRoute = async ({ params, url }) => {
  const { id } = params
  const token = url.searchParams.get('token')

  if (!id || !token) {
    return errorResponse(404, 'NOT_FOUND', 'Ordine non trovato')
  }

  try {
    const order = await api.order(id, token)
    if (!order) return errorResponse(404, 'NOT_FOUND', 'Ordine non trovato')
    return jsonResponse(order)
  } catch (err) {
    if (err instanceof ApiError) {
      return errorResponse(err.status, err.code, err.message)
    }
    console.error('[api/orders/:id] errore imprevisto', err)
    return errorResponse(500, 'INTERNAL_ERROR', 'Errore interno, riprova')
  }
}
