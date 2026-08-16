import type { APIRoute } from 'astro'
import type { AdminProductInput } from '@ecom/shared'
import { ApiError } from '~/lib/api'
import { createProduct } from '~/lib/admin-api'

/**
 * Proxy verso l'API prodotti per la creazione da /admin/prodotti/nuovo: il fetch
 * parte dal browser ma passa da qui (stesso host dello storefront), così il
 * cookie di sessione admin resta associato all'host giusto anche quando
 * `PUBLIC_API_URL` punta a un host diverso da quello dello storefront.
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

export const POST: APIRoute = async ({ request }) => {
  let body: AdminProductInput
  try {
    body = (await request.json()) as AdminProductInput
  } catch {
    return errorResponse(400, 'VALIDATION_ERROR', 'Corpo della richiesta non valido.')
  }

  try {
    const product = await createProduct(request, body)
    return jsonResponse(product)
  } catch (err) {
    if (err instanceof ApiError) {
      return errorResponse(err.status, err.code, err.message, err.details)
    }
    console.error('[api/admin/products] errore imprevisto', err)
    return errorResponse(500, 'INTERNAL_ERROR', 'Errore interno, riprova.')
  }
}
