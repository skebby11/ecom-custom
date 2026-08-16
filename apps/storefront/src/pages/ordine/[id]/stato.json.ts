import type { APIRoute } from 'astro'
import { api } from '~/lib/api'

/**
 * Proxy di polling per la pagina di conferma ordine: legge il token dal
 * cookie HttpOnly lato server e lo passa all'API, così lo script client che
 * fa polling non lo vede mai (né in chiaro né in query string).
 * Risponde solo con lo stato, non con i dati sensibili dell'ordine.
 */
export const GET: APIRoute = async ({ params, cookies }) => {
  const id = params.id
  if (!id) return new Response(null, { status: 404 })

  const token = cookies.get(`order_token_${id}`)?.value
  if (!token) return new Response(null, { status: 404 })

  const order = await api.order(id, token)
  if (!order) return new Response(null, { status: 404 })

  return new Response(JSON.stringify({ status: order.status }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
