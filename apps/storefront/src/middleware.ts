import { defineMiddleware } from 'astro:middleware'
import { getCartId, loadCart } from '~/lib/cart'

/**
 * Espone cartId/cart su Astro.locals per ogni richiesta (header con badge, pagine
 * carrello/checkout). Non deve mai far fallire la richiesta se l'API è giù.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.cartId = getCartId(context.cookies)

  try {
    context.locals.cart = await loadCart(context.cookies)
  } catch (err) {
    console.error('[middleware] errore inatteso nel caricamento del carrello', err)
    context.locals.cart = null
  }

  return next()
})
