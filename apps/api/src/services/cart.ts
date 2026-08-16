import { randomUUID } from 'node:crypto'
import { cartItems, carts, getDb, productImages, products, variants } from '@ecom/db'
import { CURRENCY, calcShippingCents } from '@ecom/shared'
import type { Cart, CartItem } from '@ecom/shared'
import { and, eq, inArray } from 'drizzle-orm'
import { badRequest, notFound, outOfStock } from '../errors.js'

function nowIso(): string {
  return new Date().toISOString()
}

/** Carica le righe carrello con i dati denormalizzati necessari alla UI, in query batch. */
async function loadCartItemsDetailed(cartId: string): Promise<CartItem[]> {
  const db = getDb()

  const rows = await db
    .select({
      id: cartItems.id,
      variantId: cartItems.variantId,
      qty: cartItems.qty,
      variantTitle: variants.title,
      sku: variants.sku,
      priceCents: variants.priceCents,
      stock: variants.stock,
      productId: variants.productId,
    })
    .from(cartItems)
    .innerJoin(variants, eq(variants.id, cartItems.variantId))
    .where(eq(cartItems.cartId, cartId))

  if (rows.length === 0) return []

  const productIds = [...new Set(rows.map((r) => r.productId))]
  const [productRows, imageRows] = await Promise.all([
    db.select({ id: products.id, slug: products.slug, title: products.title }).from(products).where(inArray(products.id, productIds)),
    db.select().from(productImages).where(inArray(productImages.productId, productIds)),
  ])
  const productById = new Map(productRows.map((p) => [p.id, p]))
  const imagesByProduct = new Map<number, typeof imageRows>()
  for (const img of imageRows) {
    const list = imagesByProduct.get(img.productId)
    if (list) list.push(img)
    else imagesByProduct.set(img.productId, [img])
  }

  return rows.map((r) => {
    const product = productById.get(r.productId)
    // una foreign key rende il caso improbabile, ma scrivere una riga d'ordine con
    // titolo/slug vuoti (snapshot immutabile) è peggio di un errore esplicito
    if (!product) throw notFound('Prodotto non trovato per una riga del carrello')
    const images = imagesByProduct.get(r.productId) ?? []
    const image = images.length ? [...images].sort((a, b) => a.position - b.position)[0] : undefined

    return {
      id: r.id,
      variantId: r.variantId,
      productSlug: product.slug,
      productTitle: product.title,
      variantTitle: r.variantTitle,
      sku: r.sku,
      imageUrl: image?.url ?? null,
      unitPriceCents: r.priceCents,
      qty: r.qty,
      lineTotalCents: r.priceCents * r.qty,
      availableStock: r.stock,
    }
  })
}

export async function serializeCart(cartId: string): Promise<Cart> {
  const items = await loadCartItemsDetailed(cartId)
  const subtotalCents = items.reduce((sum, i) => sum + i.lineTotalCents, 0)
  const shippingCents = calcShippingCents(subtotalCents)
  const totalCents = subtotalCents + shippingCents
  const itemCount = items.reduce((sum, i) => sum + i.qty, 0)
  return { id: cartId, items, subtotalCents, shippingCents, totalCents, itemCount, currency: CURRENCY }
}

export async function createCart(): Promise<Cart> {
  const db = getDb()
  const id = randomUUID()
  await db.insert(carts).values({ id })
  return serializeCart(id)
}

export async function getCartOrThrow(cartId: string): Promise<Cart> {
  const db = getDb()
  const [cart] = await db.select({ id: carts.id }).from(carts).where(eq(carts.id, cartId)).limit(1)
  if (!cart) throw notFound('Carrello non trovato')
  return serializeCart(cartId)
}

export async function addCartItem(cartId: string, variantId: number, qty: number): Promise<Cart> {
  if (!Number.isInteger(qty) || qty <= 0) throw badRequest('La quantità deve essere un intero positivo')

  const db = getDb()

  // lettura, verifica stock, scrittura e timestamp in un'unica transazione sincrona:
  // altrimenti due richieste concorrenti sulla stessa variante possono leggere lo
  // stesso `existing.qty` e perdere un incremento (o creare righe duplicate)
  db.transaction((tx) => {
    const [cart] = tx.select({ id: carts.id }).from(carts).where(eq(carts.id, cartId)).limit(1).all()
    if (!cart) throw notFound('Carrello non trovato')

    const [variant] = tx.select().from(variants).where(eq(variants.id, variantId)).limit(1).all()
    if (!variant) throw notFound('Variante non trovata')

    const [existing] = tx
      .select()
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)))
      .limit(1)
      .all()

    // aggiungere una variante già presente somma le quantità
    const alreadyInCart = existing?.qty ?? 0
    const desiredQty = alreadyInCart + qty
    if (desiredQty > variant.stock) {
      // il messaggio riporta quanti pezzi si possono ancora aggiungere, non lo stock
      // totale: con 5 pezzi già nel carrello e 14 a magazzino, aggiungibili sono 9
      const addable = Math.max(0, variant.stock - alreadyInCart)
      throw outOfStock(
        addable === 0
          ? `Hai già nel carrello tutti i ${variant.stock} pezzi disponibili`
          : `Disponibilità insufficiente: puoi aggiungerne ancora ${addable}`
      )
    }

    if (existing) {
      tx.update(cartItems).set({ qty: desiredQty }).where(eq(cartItems.id, existing.id)).run()
    } else {
      tx.insert(cartItems).values({ cartId, variantId, qty: desiredQty }).run()
    }
    tx.update(carts).set({ updatedAt: nowIso() }).where(eq(carts.id, cartId)).run()
  })

  return serializeCart(cartId)
}

export async function updateCartItem(cartId: string, itemId: number, qty: number): Promise<Cart> {
  if (!Number.isInteger(qty) || qty < 0) throw badRequest('La quantità deve essere un intero maggiore o uguale a zero')

  const db = getDb()

  const [item] = await db
    .select()
    .from(cartItems)
    .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartId)))
    .limit(1)
  if (!item) throw notFound('Riga carrello non trovata')

  if (qty === 0) {
    await db.delete(cartItems).where(eq(cartItems.id, itemId))
    return serializeCart(cartId)
  }

  const [variant] = await db.select().from(variants).where(eq(variants.id, item.variantId)).limit(1)
  if (!variant) throw notFound('Variante non trovata')
  if (qty > variant.stock) {
    throw outOfStock(`Disponibilità insufficiente: restano ${variant.stock} pezzi`)
  }

  await db.update(cartItems).set({ qty }).where(eq(cartItems.id, itemId))
  await db.update(carts).set({ updatedAt: nowIso() }).where(eq(carts.id, cartId))
  return serializeCart(cartId)
}

export async function removeCartItem(cartId: string, itemId: number): Promise<Cart> {
  const db = getDb()

  const [item] = await db
    .select({ id: cartItems.id })
    .from(cartItems)
    .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartId)))
    .limit(1)
  if (!item) throw notFound('Riga carrello non trovata')

  await db.delete(cartItems).where(eq(cartItems.id, itemId))
  await db.update(carts).set({ updatedAt: nowIso() }).where(eq(carts.id, cartId))
  return serializeCart(cartId)
}

export { loadCartItemsDetailed }
