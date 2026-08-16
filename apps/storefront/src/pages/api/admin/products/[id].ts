import type { APIRoute } from 'astro'
import type { AdminProductInput } from '@ecom/shared'
import { ApiError } from '~/lib/api'
import { updateProduct } from '~/lib/admin-api'

/**
 * Proxy verso l'API prodotti per il salvataggio da /admin/prodotti/:id: vedi
 * `products.ts` per il motivo (cookie di sessione legato all'host storefront).
 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorResponse(status: number, code: string, message: string, details?: unknown): Response {
  return jsonResponse({ error: { code, message, details } }, status)
}

export const PUT: APIRoute = async ({ request, params }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return errorResponse(400, 'VALIDATION_ERROR', 'Id prodotto non valido.')
  }

  let body: AdminProductInput
  try {
    body = (await request.json()) as AdminProductInput
  } catch {
    return errorResponse(400, 'VALIDATION_ERROR', 'Corpo della richiesta non valido.')
  }

  try {
    const product = await updateProduct(request, id, body)
    return jsonResponse(product)
  } catch (err) {
    if (err instanceof ApiError) {
      return errorResponse(err.status, err.code, err.message, err.details)
    }
    console.error('[api/admin/products/[id]] errore imprevisto', err)
    return errorResponse(500, 'INTERNAL_ERROR', 'Errore interno, riprova.')
  }
}
