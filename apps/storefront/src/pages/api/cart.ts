import type { APIRoute } from 'astro'
import type { Cart } from '@ecom/shared'
import { ApiError, apiFetch } from '~/lib/api'
import { getCartId, setCartCookie } from '~/lib/cart'

/**
 * Proxy verso l'API carrello: crea il cookie `cart_id` al primo "aggiungi al
 * carrello" così il client (src/lib/cart-client.ts) non deve gestire creazione
 * carrello né CORS verso l'API.
 */

type Body =
  | { action: 'add'; variantId: number; qty?: number }
  | { action: 'updateQty'; itemId: number; qty: number }
  | { action: 'remove'; itemId: number }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status)
}

async function runAction(cartId: string, body: Body): Promise<Cart> {
  switch (body.action) {
    case 'add':
      return apiFetch<Cart>(`/api/cart/${cartId}/items`, {
        method: 'POST',
        body: JSON.stringify({ variantId: body.variantId, qty: body.qty ?? 1 }),
      })
    case 'updateQty':
      return apiFetch<Cart>(`/api/cart/${cartId}/items/${body.itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ qty: body.qty }),
      })
    case 'remove':
      return apiFetch<Cart>(`/api/cart/${cartId}/items/${body.itemId}`, {
        method: 'DELETE',
      })
  }
}

export const POST: APIRoute = async ({ request, cookies }) => {
  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return errorResponse(400, 'VALIDATION_ERROR', 'Corpo della richiesta non valido')
  }

  if (!body || typeof body !== 'object' || !('action' in body)) {
    return errorResponse(400, 'VALIDATION_ERROR', 'Azione non riconosciuta')
  }

  try {
    let cartId = getCartId(cookies)
    if (!cartId) {
      const created = await apiFetch<Cart>('/api/cart', { method: 'POST' })
      cartId = created.id
      setCartCookie(cookies, cartId)
    }

    let cart: Cart
    try {
      cart = await runAction(cartId, body)
    } catch (err) {
      // Cookie con un carrello ormai inesistente lato API: ne creiamo uno nuovo
      // e ritentiamo solo se l'azione era un'aggiunta (per update/remove su un
      // carrello sparito non c'è nulla di sensato da ritentare).
      if (err instanceof ApiError && err.status === 404 && body.action === 'add') {
        const created = await apiFetch<Cart>('/api/cart', { method: 'POST' })
        cartId = created.id
        setCartCookie(cookies, cartId)
        cart = await runAction(cartId, body)
      } else {
        throw err
      }
    }

    return jsonResponse(cart)
  } catch (err) {
    if (err instanceof ApiError) {
      return errorResponse(err.status, err.code, err.message)
    }
    console.error('[api/cart] errore imprevisto', err)
    return errorResponse(500, 'INTERNAL_ERROR', 'Errore interno, riprova')
  }
}
