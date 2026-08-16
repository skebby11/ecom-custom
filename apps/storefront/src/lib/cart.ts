import type { AstroCookies } from 'astro'
import type { Cart } from '@ecom/shared'
import { api } from './api'

/**
 * Nome del cookie che conserva l'id del carrello. HttpOnly: il browser non deve
 * mai leggerlo via `document.cookie`. Le uniche letture avvengono lato server
 * (middleware, pagine Astro, proxy `src/pages/api/cart.ts`); le mutazioni dal
 * client passano dal proxy same-origin, che allega il cookie automaticamente.
 */
export const CART_COOKIE = 'cart_id'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export function getCartId(cookies: AstroCookies): string | undefined {
  return cookies.get(CART_COOKIE)?.value
}

export function setCartCookie(cookies: AstroCookies, cartId: string): void {
  cookies.set(CART_COOKIE, cartId, {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: import.meta.env.PROD,
    maxAge: ONE_YEAR_SECONDS,
  })
}

/**
 * Carica il carrello corrente a partire dal cookie. Non lancia mai: se l'id manca
 * o l'API non risponde, restituisce `null` (usato dal middleware per non far
 * fallire l'intera richiesta quando l'API è giù).
 */
export async function loadCart(cookies: AstroCookies): Promise<Cart | null> {
  const cartId = getCartId(cookies)
  if (!cartId) return null
  try {
    return await api.cart(cartId)
  } catch (err) {
    console.error('[cart] impossibile caricare il carrello', err)
    return null
  }
}
