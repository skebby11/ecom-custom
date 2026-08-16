import type { Cart } from '@ecom/shared'

/**
 * Script client condiviso per le azioni carrello. Parla solo con il proxy
 * same-origin `/api/cart` (niente CORS, niente gestione cookie lato client
 * oltre alla lettura per l'UI). Nessuna dipendenza esterna.
 */

type CartAction =
  | { action: 'add'; variantId: number; qty?: number }
  | { action: 'updateQty'; itemId: number; qty: number }
  | { action: 'remove'; itemId: number }

async function callCartApi(body: CartAction): Promise<Cart> {
  const res = await fetch('/api/cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  const data = text ? JSON.parse(text) : null

  if (!res.ok) {
    const message =
      (data && data.error && typeof data.error.message === 'string' && data.error.message) ||
      'Operazione non riuscita, riprova'
    throw new Error(message)
  }

  return data as Cart
}

/** Aggiorna il contatore nell'header (badge sull'icona carrello). */
export function updateCartBadge(cart: Cart | null): void {
  const badge = document.querySelector<HTMLElement>('[data-cart-badge]')
  if (!badge) return
  const count = cart?.itemCount ?? 0
  badge.textContent = String(count)
  badge.hidden = count === 0
}

/** Mostra un toast accessibile (aria-live) per confermare/segnalare un'azione. */
export function showToast(message: string, variant: 'success' | 'error' = 'success'): void {
  const toast = document.querySelector<HTMLElement>('[data-toast]')
  if (!toast) return

  toast.textContent = message
  toast.dataset.variant = variant
  toast.hidden = false

  const previousTimer = toast.dataset.timer ? Number(toast.dataset.timer) : undefined
  if (previousTimer) window.clearTimeout(previousTimer)

  const timer = window.setTimeout(() => {
    toast.hidden = true
  }, 3500)
  toast.dataset.timer = String(timer)
}

export async function addToCart(variantId: number, qty = 1): Promise<Cart | null> {
  try {
    const cart = await callCartApi({ action: 'add', variantId, qty })
    updateCartBadge(cart)
    showToast('Prodotto aggiunto al carrello')
    return cart
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Errore, riprova', 'error')
    return null
  }
}

export async function updateQty(itemId: number, qty: number): Promise<Cart | null> {
  try {
    const cart = await callCartApi({ action: 'updateQty', itemId, qty })
    updateCartBadge(cart)
    return cart
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Errore, riprova', 'error')
    return null
  }
}

export async function removeItem(itemId: number): Promise<Cart | null> {
  try {
    const cart = await callCartApi({ action: 'remove', itemId })
    updateCartBadge(cart)
    showToast('Prodotto rimosso dal carrello')
    return cart
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Errore, riprova', 'error')
    return null
  }
}
