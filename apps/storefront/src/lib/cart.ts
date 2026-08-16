import type { AstroCookies } from 'astro'
import type { Cart } from '@ecom/shared'
import { api } from './api'

/** Nome del cookie che conserva l'id del carrello. Non HttpOnly: serve leggerlo da JS lato client. */
export const CART_COOKIE = 'cart_id'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export function getCartId(cookies: AstroCookies): string | undefined {
  return cookies.get(CART_COOKIE)?.value
}

export function setCartCookie(cookies: AstroCookies, cartId: string): void {
  cookies.set(CART_COOKIE, cartId, {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
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
