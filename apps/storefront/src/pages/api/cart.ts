import type { APIRoute } from 'astro'
import type { Cart } from '@ecom/shared'
import { addToCartSchema, updateCartItemSchema } from '@ecom/shared'
import { ApiError, apiFetch } from '~/lib/api'
import { getCartId, setCartCookie } from '~/lib/cart'
import { errorResponse, jsonResponse } from '~/lib/route-response'

/**
 * Proxy verso l'API carrello: crea il cookie `cart_id` al primo "aggiungi al
 * carrello" così il client (src/lib/cart-client.ts) non deve gestire creazione
 * carrello né CORS verso l'API.
 */

type Body =
  | { action: 'add'; variantId: number; qty?: number }
  | { action: 'updateQty'; itemId: number; qty: number }
  | { action: 'remove'; itemId: number }

/** Segmento di path sicuro: niente `/`, `.` o caratteri che permettano di uscire da `/api/cart/<id>`. */
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

function isSafePathId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID_PATTERN.test(value)
}

function isSafeItemId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && Number.isSafeInteger(value)
}

/**
 * Valida il corpo grezzo della richiesta. Il cast `as Body` da solo non basta:
 * un client può inviare qualunque JSON (es. `itemId: "../../orders/1"`), e
 * quel valore finirebbe interpolato nel path passato a `apiFetch`.
 */
function parseBody(raw: unknown): Body | null {
  if (!raw || typeof raw !== 'object' || !('action' in raw)) return null
  const action = (raw as { action?: unknown }).action

  if (action === 'add') {
    const parsed = addToCartSchema.safeParse(raw)
    if (!parsed.success) return null
    return { action: 'add', variantId: parsed.data.variantId, qty: parsed.data.qty }
  }

  if (action === 'updateQty') {
    const itemId = (raw as { itemId?: unknown }).itemId
    if (!isSafeItemId(itemId)) return null
    const parsed = updateCartItemSchema.safeParse(raw)
    if (!parsed.success) return null
    return { action: 'updateQty', itemId, qty: parsed.data.qty }
  }

  if (action === 'remove') {
    const itemId = (raw as { itemId?: unknown }).itemId
    if (!isSafeItemId(itemId)) return null
    return { action: 'remove', itemId }
  }

  return null
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
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return errorResponse(400, 'VALIDATION_ERROR', 'Corpo della richiesta non valido')
  }

  const body = parseBody(rawBody)
  if (!body) {
    return errorResponse(400, 'VALIDATION_ERROR', 'Azione non riconosciuta o dati non validi')
  }

  try {
    let cartId = getCartId(cookies)
    // Il cookie è manomettibile dal client: se non rispetta il formato atteso,
    // trattalo come assente invece di interpolarlo in un path verso l'API.
    if (cartId && !isSafePathId(cartId)) cartId = undefined
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
