import { randomBytes, randomUUID } from 'node:crypto'
import { cartItems, getDb, orderItems, orders, products, variants } from '@ecom/db'
import { CURRENCY, LOW_STOCK_THRESHOLD, calcShippingCents } from '@ecom/shared'
import type {
  Address,
  AdminStats,
  Order,
  OrderStatus,
  Paginated,
  checkoutSessionSchema,
} from '@ecom/shared'
import { and, desc, eq, inArray, like, lte, sql } from 'drizzle-orm'
import type Stripe from 'stripe'
import type { z } from 'zod'
import { env } from '../env.js'
import { AppError, cartEmpty, notFound, outOfStock } from '../errors.js'
import { getStripe } from '../lib/stripe.js'
import { loadCartItemsDetailed } from './cart.js'

type CheckoutInput = z.infer<typeof checkoutSessionSchema>
type OrderRow = typeof orders.$inferSelect
type OrderItemRow = typeof orderItems.$inferSelect

function groupBy<T, K>(rows: T[], keyFn: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const row of rows) {
    const key = keyFn(row)
    const list = map.get(key)
    if (list) list.push(row)
    else map.set(key, [row])
  }
  return map
}

function serializeOrder(order: OrderRow, items: OrderItemRow[]): Order {
  return {
    id: order.id,
    number: order.number,
    email: order.email,
    status: order.status,
    items: items.map((i) => ({
      id: i.id,
      productTitle: i.productTitle,
      variantTitle: i.variantTitle,
      sku: i.sku,
      imageUrl: i.imageUrl,
      unitPriceCents: i.unitPriceCents,
      qty: i.qty,
      lineTotalCents: i.unitPriceCents * i.qty,
    })),
    subtotalCents: order.subtotalCents,
    shippingCents: order.shippingCents,
    totalCents: order.totalCents,
    currency: order.currency,
    shippingAddress: (order.shippingAddress as Address | null) ?? null,
    createdAt: order.createdAt,
  }
}

async function loadOrderItems(orderId: string): Promise<OrderItemRow[]> {
  const db = getDb()
  return db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(orderItems.id)
}

export async function beginCheckout(input: CheckoutInput): Promise<{ url: string; orderId: string; token: string }> {
  const stripe = getStripe()
  if (!stripe) {
    // l'ordine pending NON va creato se Stripe non è configurato
    throw new AppError(
      503,
      'STRIPE_NOT_CONFIGURED',
      'Pagamenti non configurati: compila STRIPE_SECRET_KEY nel file .env per abilitare il checkout'
    )
  }

  const items = await loadCartItemsDetailed(input.cartId)
  if (items.length === 0) throw cartEmpty()

  for (const item of items) {
    if (item.qty > item.availableStock) {
      throw outOfStock(`"${item.productTitle}" — disponibili solo ${item.availableStock} pezzi`)
    }
  }

  const subtotalCents = items.reduce((s, i) => s + i.lineTotalCents, 0)
  const shippingCents = calcShippingCents(subtotalCents)
  const totalCents = subtotalCents + shippingCents

  const orderId = randomUUID()
  const accessToken = randomBytes(24).toString('hex')

  const db = getDb()
  // sincrona: better-sqlite3 non supporta callback async dentro db.transaction();
  // la chiamata Stripe resta fuori, dopo il commit (vedi sotto)
  db.transaction((tx) => {
    // numero progressivo per anno, calcolato dentro la stessa transazione dell'insert
    const year = new Date().getFullYear()
    const prefix = `ORD-${year}-`
    const [countRow] = tx
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(like(orders.number, `${prefix}%`))
      .all()
    const number = `${prefix}${String((countRow?.count ?? 0) + 1).padStart(4, '0')}`

    tx.insert(orders)
      .values({
        id: orderId,
        number,
        email: input.email,
        status: 'pending',
        subtotalCents,
        shippingCents,
        totalCents,
        currency: CURRENCY,
        accessToken,
        shippingAddress: input.shippingAddress ?? null,
        cartId: input.cartId,
      })
      .run()

    tx.insert(orderItems)
      .values(
        items.map((item) => ({
          orderId,
          variantId: item.variantId,
          productSlug: item.productSlug,
          productTitle: item.productTitle,
          variantTitle: item.variantTitle,
          sku: item.sku,
          imageUrl: item.imageUrl,
          unitPriceCents: item.unitPriceCents,
          qty: item.qty,
        }))
      )
      .run()
  })

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((item) => ({
    quantity: item.qty,
    price_data: {
      currency: 'eur',
      unit_amount: item.unitPriceCents,
      product_data: {
        name: `${item.productTitle} — ${item.variantTitle}`,
        // Stripe richiede URL assolute pubbliche: ignoriamo le immagini locali/relative
        ...(item.imageUrl?.startsWith('http') ? { images: [item.imageUrl] } : {}),
      },
    },
  }))

  if (shippingCents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: { currency: 'eur', unit_amount: shippingCents, product_data: { name: 'Spedizione' } },
    })
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    customer_email: input.email,
    client_reference_id: orderId,
    metadata: { orderId },
    success_url: `${env.PUBLIC_SITE_URL}/ordine/${orderId}?token=${accessToken}`,
    cancel_url: `${env.PUBLIC_SITE_URL}/carrello`,
  })

  if (!session.url) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Stripe non ha restituito un URL di pagamento')
  }

  await db.update(orders).set({ stripeSessionId: session.id }).where(eq(orders.id, orderId))

  return { url: session.url, orderId, token: accessToken }
}

export async function getOrderForCustomer(orderId: string, token: string): Promise<Order> {
  const db = getDb()
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
  // stesso 404 sia per id inesistente che per token errato: non si rivela l'esistenza dell'ordine
  if (!order || order.accessToken !== token) throw notFound('Ordine non trovato')
  const items = await loadOrderItems(orderId)
  return serializeOrder(order, items)
}

/* ------------------------------------------------------------------ */
/* Webhook Stripe                                                      */
/* ------------------------------------------------------------------ */

export async function markOrderPaid(orderId: string, paymentIntentId: string | null): Promise<void> {
  const db = getDb()
  // sincrona: better-sqlite3 non supporta callback async dentro db.transaction()
  db.transaction((tx) => {
    const [order] = tx.select().from(orders).where(eq(orders.id, orderId)).limit(1).all()
    // 'fulfilled' è terminale quanto 'paid': un evento Stripe duplicato non deve
    // ri-scalare lo stock né retrocedere lo stato di un ordine già evaso
    if (!order || order.status === 'paid' || order.status === 'fulfilled') return

    const items = tx.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all()
    for (const item of items) {
      if (item.variantId != null) {
        tx.update(variants)
          .set({ stock: sql`max(${variants.stock} - ${item.qty}, 0)` })
          .where(eq(variants.id, item.variantId))
          .run()
      }
    }

    tx.update(orders)
      .set({ status: 'paid', stripePaymentIntentId: paymentIntentId, updatedAt: new Date().toISOString() })
      .where(eq(orders.id, orderId))
      .run()

    if (order.cartId) {
      tx.delete(cartItems).where(eq(cartItems.cartId, order.cartId)).run()
    }
  })
}

export async function markOrderFailed(orderId: string): Promise<void> {
  const db = getDb()
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
  // stessa ragione di markOrderPaid: un evento expired/failed tardivo non deve
  // retrocedere un ordine già pagato o già evaso
  if (!order || order.status === 'paid' || order.status === 'fulfilled') return
  await db.update(orders).set({ status: 'failed', updatedAt: new Date().toISOString() }).where(eq(orders.id, orderId))
}

/* ------------------------------------------------------------------ */
/* Admin — ordini                                                       */
/* ------------------------------------------------------------------ */

export async function adminListOrders(params: { status?: OrderStatus; page: number; limit: number }): Promise<Paginated<Order>> {
  const db = getDb()
  const conditions = params.status ? [eq(orders.status, params.status)] : []

  const allOrders = await db
    .select()
    .from(orders)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(orders.createdAt))

  const total = allOrders.length
  const start = (params.page - 1) * params.limit
  const pageOrders = allOrders.slice(start, start + params.limit)
  const ids = pageOrders.map((o) => o.id)

  const items = ids.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, ids)) : []
  const itemsByOrder = groupBy(items, (i) => i.orderId)

  return {
    items: pageOrders.map((o) => serializeOrder(o, itemsByOrder.get(o.id) ?? [])),
    total,
    page: params.page,
    pages: Math.max(1, Math.ceil(total / params.limit)),
    limit: params.limit,
  }
}

export async function adminGetOrder(id: string): Promise<Order> {
  const db = getDb()
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1)
  if (!order) throw notFound('Ordine non trovato')
  const items = await loadOrderItems(id)
  return serializeOrder(order, items)
}

export async function adminUpdateOrderStatus(id: string, status: OrderStatus): Promise<Order> {
  const db = getDb()
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1)
  if (!order) throw notFound('Ordine non trovato')

  await db.update(orders).set({ status, updatedAt: new Date().toISOString() }).where(eq(orders.id, id))
  const items = await loadOrderItems(id)
  return serializeOrder({ ...order, status }, items)
}

/* ------------------------------------------------------------------ */
/* Admin — statistiche                                                 */
/* ------------------------------------------------------------------ */


export async function getAdminStats(): Promise<AdminStats> {
  const db = getDb()

  const [productsCountRows, ordersCountRows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(products),
    db.select({ count: sql<number>`count(*)` }).from(orders),
  ])
  const productsCount = productsCountRows[0]?.count ?? 0
  const ordersCount = ordersCountRows[0]?.count ?? 0

  const [{ revenueCents = 0 } = { revenueCents: 0 }] = await db
    .select({ revenueCents: sql<number>`coalesce(sum(total_cents), 0)` })
    .from(orders)
    .where(inArray(orders.status, ['paid', 'fulfilled']))

  const [{ count: pendingOrders = 0 } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(orders)
    .where(eq(orders.status, 'pending'))

  const lowStockRows = await db
    .select({ id: variants.id, sku: variants.sku, title: variants.title, stock: variants.stock, productId: variants.productId })
    .from(variants)
    .where(lte(variants.stock, LOW_STOCK_THRESHOLD))
    .orderBy(variants.stock)
    .limit(20)

  const productIds = [...new Set(lowStockRows.map((v) => v.productId))]
  const productRows = productIds.length
    ? await db.select({ id: products.id, title: products.title, slug: products.slug }).from(products).where(inArray(products.id, productIds))
    : []
  const productById = new Map(productRows.map((p) => [p.id, p]))

  return {
    products: productsCount,
    orders: ordersCount,
    revenueCents,
    pendingOrders,
    lowStock: lowStockRows.map((v) => ({
      variantId: v.id,
      sku: v.sku,
      variantTitle: v.title,
      stock: v.stock,
      productId: v.productId,
      productTitle: productById.get(v.productId)?.title ?? '',
      productSlug: productById.get(v.productId)?.slug ?? '',
    })),
  }
}
